/**
 * Pattern Learner — discovers recurring risk patterns from historical data.
 *
 * After each new event, this service queries the database to find
 * statistically significant correlations and stores them in the
 * learned_patterns table.
 *
 * Discovered pattern types:
 *   1. Service + change_type failure rates
 *   2. Day-of-week + change_type failure rates (e.g. "Friday DB migrations")
 *   3. Change-size failure correlations
 *   4. Cascade patterns (service A change → service B incident)
 *   5. Author-specific failure streaks
 */

import { getDb } from '../db/schema.js';
import { retain, isHindsightAvailable } from './hindsightService.js';

/* Minimum deployments needed before a pattern is considered significant */
const MIN_EVIDENCE = 3;
/* Minimum failure rate to flag as a pattern */
const MIN_FAILURE_RATE = 0.25;

/**
 * Runs all pattern discovery queries and upserts results into learned_patterns.
 * Call this after ingesting any new event.
 */
export function recomputePatterns() {
  const db = getDb();
  const now = new Date().toISOString();

  /* Clear existing patterns and recompute fresh */
  db.prepare('DELETE FROM learned_patterns').run();

  discoverServiceChangeTypePatterns(db, now);
  discoverDayOfWeekPatterns(db, now);
  discoverChangeSizePatterns(db, now);
  discoverCascadePatterns(db, now);
  discoverAuthorPatterns(db, now);
  discoverRecentStreakPatterns(db, now);

  const allPatterns = db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
  console.log(`[PatternLearner] Discovered ${allPatterns.length} patterns`);

  /* Retain high-value failure patterns into Hindsight Cloud episodic memory */
  if (isHindsightAvailable()) {
    for (const p of allPatterns) {
      const mem = `AUTONOMOUS RISK PATTERN for ${p.service || 'microservices'} (${p.change_type || 'all'}): ` +
        `${p.pattern_description}. Severity: ${p.severity}. Risk Multiplier: ${p.risk_multiplier}x. ` +
        (p.root_cause ? `Root Cause: ${p.root_cause}. ` : '') +
        (p.prevention_playbook ? `Enforced Prevention Playbook: ${p.prevention_playbook}. ` : '') +
        (p.blast_radius ? `Blast Radius: ${p.blast_radius}.` : '');
      retain(mem).catch(() => {});
    }
  }

  return allPatterns.length;
}

/* ================================================================== */
/*  Pattern discovery functions                                        */
/* ================================================================== */

/**
 * Pattern 1: "X changes to Y-service have a Z% failure rate"
 */
function discoverServiceChangeTypePatterns(db, now) {
  const rows = db.prepare(`
    SELECT service, change_type,
           COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    GROUP BY service, change_type
    HAVING total >= ?
  `).all(MIN_EVIDENCE);

  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const rate = row.failures / row.total;
    if (rate >= MIN_FAILURE_RATE) {
      const pct = (rate * 100).toFixed(0);
      const desc = `${row.change_type} changes to ${row.service} have a ${pct}% failure rate (${row.failures}/${row.total} failed)`;
      const multiplier = Math.round((1 + rate) * 10) / 10;
      const severity = rate >= 0.75 ? 'critical' : rate >= 0.5 ? 'high' : 'moderate';
      const confidence = Math.min(99, Math.round(70 + (row.total * 3)));

      const sampleFailure = db.prepare(`
        SELECT bf.root_cause, bf.fix_applied, inc.summary AS incident_summary, inc.downstream_services_affected
        FROM deployments d
        LEFT JOIN build_failures bf ON bf.deployment_id = d.id
        LEFT JOIN incidents inc ON inc.deployment_id = d.id
        WHERE d.service = ? AND d.change_type = ? AND d.status != 'success'
        ORDER BY d.timestamp DESC
        LIMIT 1
      `).get(row.service, row.change_type);

      let rootCause = sampleFailure?.root_cause || `${row.change_type} changes to ${row.service} frequently encounter synchronization or environment mismatches under high concurrency.`;
      let playbook = sampleFailure?.fix_applied || `Require unit and integration tests passing in staging; inject strict timeouts and retry thresholds before merging.`;
      let blastRadius = 'Downstream API clients and reliant microservices';

      if (sampleFailure?.downstream_services_affected && sampleFailure.downstream_services_affected !== '[]') {
        try {
          const list = JSON.parse(sampleFailure.downstream_services_affected);
          if (Array.isArray(list) && list.length > 0) blastRadius = list.join(', ');
        } catch {}
      }

      insert.run(desc, row.change_type, row.service, severity, multiplier, row.total, confidence, rootCause, playbook, blastRadius, now);
    }
  }
}

/**
 * Pattern 2: "DB migrations on Friday have a X% failure rate"
 */
function discoverDayOfWeekPatterns(db, now) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const allDeploys = db.prepare(`
    SELECT timestamp, change_type, status, service FROM deployments
  `).all();

  /* Group by day + change_type */
  const buckets = {};
  for (const d of allDeploys) {
    const day = new Date(d.timestamp).getDay();
    const key = `${day}:${d.change_type}`;
    if (!buckets[key]) buckets[key] = { total: 0, failures: 0, day, change_type: d.change_type, services: new Set() };
    buckets[key].total++;
    buckets[key].services.add(d.service);
    if (d.status !== 'success') buckets[key].failures++;
  }

  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const bucket of Object.values(buckets)) {
    if (bucket.total < MIN_EVIDENCE) continue;
    const rate = bucket.failures / bucket.total;
    if (rate >= MIN_FAILURE_RATE) {
      const pct = (rate * 100).toFixed(0);
      const dayName = dayNames[bucket.day];
      const desc = `${bucket.change_type} changes on ${dayName} have a ${pct}% failure rate (${bucket.failures}/${bucket.total} deployments)`;
      const multiplier = Math.round((1 + rate) * 10) / 10;
      const severity = rate >= 0.7 ? 'critical' : 'high';
      const confidence = Math.min(95, Math.round(65 + (bucket.total * 4)));
      const rootCause = `Deploying ${bucket.change_type} on ${dayName} coincides with high production customer volume and reduced on-call engineer coverage.`;
      const playbook = `Enforce change freeze on ${dayName}s for ${bucket.change_type} changes. Schedule heavy updates during low-traffic maintenance windows with 30-min soak test.`;
      const blastRadius = Array.from(bucket.services).join(', ') || 'All core services';

      insert.run(desc, bucket.change_type, 'multiple services', severity, multiplier, bucket.total, confidence, rootCause, playbook, blastRadius, now);
    }
  }
}

/**
 * Pattern 3: "Deploys with >500 lines changed fail X% more often"
 */
function discoverChangeSizePatterns(db, now) {
  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bigRow = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    WHERE lines_changed > 500
  `).get();

  if (bigRow && bigRow.total >= MIN_EVIDENCE) {
    const rate = bigRow.failures / bigRow.total;
    if (rate >= MIN_FAILURE_RATE) {
      const pct = (rate * 100).toFixed(0);
      const desc = `Deploys with >500 lines changed have a ${pct}% failure rate (${bigRow.failures}/${bigRow.total} failed)`;
      const rootCause = `Large PRs bundle multiple unisolated concerns together. High review fatigue leads to overlooked regressions, and large patches trigger container memory spikes during compilation.`;
      const playbook = `Enforce atomic PR policy: break PRs exceeding 300 lines into incremental, independently testable phases. Merge schema changes ahead of business logic.`;
      const blastRadius = `Cluster memory exhaustion, cross-service regression risk`;

      insert.run(desc, 'code', 'cross-service', 'critical', 2.5, bigRow.total, 96, rootCause, playbook, blastRadius, now);
    }
  }
}

/**
 * Pattern 4: "Config changes to X cascade into incidents on Y"
 */
function discoverCascadePatterns(db, now) {
  const rows = db.prepare(`
    SELECT d.service AS source_service,
           d.change_type,
           i.downstream_services_affected,
           COUNT(*) AS evidence
    FROM incidents i
    JOIN deployments d ON d.id = i.deployment_id
    WHERE i.downstream_services_affected != '[]'
    GROUP BY d.service, d.change_type, i.downstream_services_affected
    HAVING evidence >= 2
  `).all();

  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    let affected;
    try {
      affected = JSON.parse(row.downstream_services_affected);
    } catch {
      continue;
    }
    if (!Array.isArray(affected) || affected.length === 0) continue;

    const desc = `${row.change_type} changes to ${row.source_service} cascade timeouts into ${affected.join(', ')}`;
    const rootCause = `Synchronous HTTP/gRPC coupling between ${row.source_service} and ${affected.join(', ')} causes backpressure stalls whenever ${row.source_service} experiences latency spikes.`;
    const playbook = `Introduce circuit breaker pattern with graceful fallback responses. Decouple synchronous calls using asynchronous event queues where possible.`;
    const blastRadius = affected.join(', ');

    insert.run(desc, row.change_type, row.source_service, 'critical', 1.8, row.evidence, 90, rootCause, playbook, blastRadius, now);
  }
}

/**
 * Pattern 5: "Author X has a higher failure rate on service Y"
 */
function discoverAuthorPatterns(db, now) {
  const rows = db.prepare(`
    SELECT author, service,
           COUNT(*) AS total,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures
    FROM deployments
    GROUP BY author, service
    HAVING total >= ?
  `).all(MIN_EVIDENCE);

  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    const rate = row.failures / row.total;
    if (rate >= 0.5 && row.total >= 3) {
      const pct = (rate * 100).toFixed(0);
      const desc = `${row.author}'s deployments to ${row.service} have a ${pct}% failure rate (${row.failures}/${row.total} failed)`;
      const rootCause = `Higher error density when deploying changes without peer architecture review on ${row.service}.`;
      const playbook = `Require 2-person code review sign-off and mandatory staging smoke tests before deployment.`;
      const blastRadius = `${row.service} core features`;

      insert.run(desc, 'process', row.service, 'moderate', 1.5, row.total, 82, rootCause, playbook, blastRadius, now);
    }
  }
}

/**
 * Pattern 6: "Service X has had N consecutive failures recently"
 */
function discoverRecentStreakPatterns(db, now) {
  const services = db.prepare('SELECT DISTINCT service FROM deployments').all();

  const insert = db.prepare(`
    INSERT INTO learned_patterns (
      pattern_description, change_type, service, severity, risk_multiplier,
      evidence_count, confidence_pct, root_cause, prevention_playbook, blast_radius, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const { service } of services) {
    const recent = db.prepare(`
      SELECT status FROM deployments
      WHERE service = ?
      ORDER BY timestamp DESC
      LIMIT 5
    `).all(service);

    let streak = 0;
    for (const d of recent) {
      if (d.status !== 'success') streak++;
      else break;
    }

    if (streak >= 2) {
      const desc = `${service} has ${streak} consecutive recent failures — elevated vulnerability`;
      const rootCause = `Service is experiencing active instability or broken baseline builds that haven't been properly stabilized.`;
      const playbook = `Freeze non-emergency deployments to ${service}. Require post-mortem and green staging verification before approving next release.`;
      const blastRadius = `${service} consumers and integration pipelines`;

      insert.run(desc, 'pipeline', service, 'high', 1.0 + (streak * 0.3), streak, 88, rootCause, playbook, blastRadius, now);
    }
  }
}

/**
 * Returns all currently discovered patterns.
 */
export function getPatterns() {
  const db = getDb();
  return db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
}
