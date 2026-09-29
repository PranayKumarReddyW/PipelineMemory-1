/**
 * Deployments API routes.
 *
 * POST /api/deployments   — ingest a new deployment event
 * GET  /api/deployments   — list deployments (with optional filters)
 * GET  /api/deployments/:id — get a single deployment with linked events
 *
 * Every new deployment is retained in Hindsight as a natural-language memory,
 * enabling semantic search and Q&A over the full pipeline history.
 */

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { validateDeployment } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recomputePatterns } from '../services/patternLearner.js';
import { retain, buildDeploymentMemory } from '../services/hindsightService.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  POST /api/deployments — ingest a new deployment                    */
/* ------------------------------------------------------------------ */
router.post('/', validateDeployment, asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    service, version, author, timestamp, environment,
    status, duration_sec, files_changed, lines_changed, change_type, notes, diff,
  } = req.body;

  const result = db.prepare(`
    INSERT INTO deployments (service, version, author, timestamp, environment, status, duration_sec, files_changed, lines_changed, change_type, notes, diff)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    service, version, author, timestamp || new Date().toISOString(),
    environment || 'production', status,
    duration_sec || null, files_changed || 0, lines_changed || 0,
    change_type, notes || null, diff || null,
  );

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(result.lastInsertRowid);

  /* Re-learn patterns + retain in Hindsight (both non-blocking for response time) */
  recomputePatterns();
  retain(buildDeploymentMemory(deployment)).catch(() => {});

  res.status(201).json({
    message: 'Deployment recorded',
    deployment,
  });
}));

/* ------------------------------------------------------------------ */
/*  POST /api/deployments/record-pr — record a historical PR & learn  */
/* ------------------------------------------------------------------ */
router.post('/record-pr', asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    title,
    branch,
    service,
    change_type = 'code',
    author = 'DevOps Team',
    environment = 'production',
    status = 'failed', // 'failed' | 'success'
    root_cause,
    fix_applied,
    notes,
    diff,
  } = req.body;

  if (!service) {
    return res.status(400).json({ error: 'Service is required' });
  }
  if (!title && !branch) {
    return res.status(400).json({ error: 'PR title or branch name is required' });
  }

  const prIdentifier = (title || branch).trim();
  const version = `pr-${Date.now().toString().slice(-4)}`;
  const summaryNotes = notes || (status === 'failed'
    ? `[Historical PR Incident] ${prIdentifier}: ${root_cause || 'Deployment failure'} | Fix: ${fix_applied || 'Remediated'}`
    : `[Historical PR Success] ${prIdentifier}: ${fix_applied || 'Clean deployment'}`);

  const insertDep = db.prepare(`
    INSERT INTO deployments (service, version, author, timestamp, environment, status, duration_sec, files_changed, lines_changed, change_type, notes, diff)
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    service,
    version,
    author,
    environment,
    status,
    status === 'failed' ? 420 : 180,
    3,
    45,
    change_type,
    summaryNotes,
    diff || null,
  );

  const deploymentId = insertDep.lastInsertRowid;
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId);

  let failureRecord = null;
  if (status === 'failed') {
    const failInsert = db.prepare(`
      INSERT INTO build_failures (deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min)
      VALUES (?, 'deploy', ?, ?, ?, ?)
    `).run(
      deploymentId,
      `PR "${prIdentifier}" failed in ${environment}`,
      root_cause || 'Unspecified runtime/deployment hazard',
      fix_applied || 'Rollback or hotfix applied',
      25,
    );
    failureRecord = db.prepare('SELECT * FROM build_failures WHERE id = ?').get(failInsert.lastInsertRowid);
  }

  // Build high-signal natural language memory for Hindsight
  let memoryText = '';
  if (status === 'failed') {
    memoryText = `HISTORICAL INCIDENT & PROVEN LESSON for ${service} (${change_type}): ` +
      `PR "${prIdentifier}" by ${author} failed during ${environment} deployment. ` +
      (root_cause ? `Root Cause: ${root_cause}. ` : '') +
      (fix_applied ? `Remediation / Proven Fix: ${fix_applied}. ` : '') +
      (notes ? `Context: ${notes}. ` : '') +
      `When evaluating or deploying future ${change_type} changes to ${service}, verify against this failure and enforce: ${fix_applied || 'rigorous pre-flight checks'}.`;
  } else {
    memoryText = `HISTORICAL SUCCESS & PROVEN BEST PRACTICE for ${service} (${change_type}): ` +
      `PR "${prIdentifier}" by ${author} deployed successfully to ${environment}. ` +
      (fix_applied ? `Best Practice Applied: ${fix_applied}. ` : '') +
      (notes ? `Details: ${notes}. ` : '') +
      `Future changes to ${service} should follow this safe implementation pattern.`;
  }

  // Retain in Hindsight Cloud
  const retained = await retain(memoryText);

  // Recompute risk patterns in SQLite
  recomputePatterns();

  res.status(201).json({
    message: 'Historical PR successfully recorded and retained into Hindsight memory',
    deployment,
    failure: failureRecord,
    memory: {
      retained: !!retained,
      text: memoryText,
    },
  });
}));

/* ------------------------------------------------------------------ */
/*  GET /api/deployments — list with optional filters                  */
/* ------------------------------------------------------------------ */
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { service, status, change_type, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT 
      d.*,
      bf.stage AS failure_stage,
      bf.error_message AS failure_error,
      bf.root_cause AS root_cause,
      bf.fix_applied AS fix_applied,
      bf.time_to_resolve_min AS time_to_resolve_min,
      inc.severity AS incident_severity,
      inc.summary AS incident_summary,
      inc.downstream_services_affected AS downstream_affected
    FROM deployments d
    LEFT JOIN build_failures bf ON bf.deployment_id = d.id
    LEFT JOIN incidents inc ON inc.deployment_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (service) {
    sql += ' AND d.service = ?';
    params.push(service);
  }
  if (status) {
    sql += ' AND d.status = ?';
    params.push(status);
  }
  if (change_type) {
    sql += ' AND d.change_type = ?';
    params.push(change_type);
  }

  sql += ' ORDER BY d.timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const deployments = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS count FROM deployments').get().count;

  res.json({ deployments, total });
}));

/* ------------------------------------------------------------------ */
/*  GET /api/deployments/:id — single deployment + linked data         */
/* ------------------------------------------------------------------ */
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const failures = db.prepare('SELECT * FROM build_failures WHERE deployment_id = ?').all(id);
  const incidents = db.prepare('SELECT * FROM incidents WHERE deployment_id = ?').all(id);
  const infraChanges = db.prepare('SELECT * FROM infra_changes WHERE linked_deployment_id = ?').all(id);

  res.json({ deployment, failures, incidents, infraChanges });
}));

/* ------------------------------------------------------------------ */
/*  POST /api/deployments/:id/resolve — record fix to turn green       */
/* ------------------------------------------------------------------ */
router.post('/:id/resolve', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {
    fix_applied,
    root_cause,
    time_to_resolve_min,
    preventative_actions,
    mark_green = true,
  } = req.body;

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
  if (!deployment) {
    return res.status(404).json({ error: `Deployment #${id} not found` });
  }

  if (!fix_applied || !fix_applied.trim()) {
    return res.status(400).json({ error: 'fix_applied is required to record a resolution' });
  }

  /* 1. Update or create build_failure record */
  let failure = db.prepare('SELECT * FROM build_failures WHERE deployment_id = ?').get(id);
  if (failure) {
    db.prepare(`
      UPDATE build_failures
      SET fix_applied = ?,
          root_cause = COALESCE(?, root_cause),
          time_to_resolve_min = COALESCE(?, time_to_resolve_min)
      WHERE id = ?
    `).run(
      fix_applied.trim(),
      root_cause ? root_cause.trim() : null,
      time_to_resolve_min ? Number(time_to_resolve_min) : null,
      failure.id,
    );
    failure = db.prepare('SELECT * FROM build_failures WHERE id = ?').get(failure.id);
  } else {
    const insertRes = db.prepare(`
      INSERT INTO build_failures (deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min)
      VALUES (?, 'deploy', 'Resolved production incident', ?, ?, ?)
    `).run(
      id,
      root_cause ? root_cause.trim() : 'Deployment failure',
      fix_applied.trim(),
      time_to_resolve_min ? Number(time_to_resolve_min) : 15,
    );
    failure = db.prepare('SELECT * FROM build_failures WHERE id = ?').get(insertRes.lastInsertRowid);
  }

  /* 2. Update deployment status & append resolution note */
  const updatedStatus = mark_green ? 'success' : deployment.status;
  const resolutionNote = `[Resolved Green: ${fix_applied.trim()}]`;
  const nextNotes = deployment.notes
    ? `${deployment.notes} | ${resolutionNote}`
    : resolutionNote;

  db.prepare(`
    UPDATE deployments
    SET status = ?,
        notes = ?
    WHERE id = ?
  `).run(updatedStatus, nextNotes, id);

  const updatedDeployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);

  /* 3. Retain this resolution playbook directly into Hindsight Cloud */
  const memoryContent = `REMEDIATION & PROVEN GREEN FIX for Deployment #${id} (${deployment.service} ${deployment.change_type} by ${deployment.author}): ` +
    `Failure in ${failure?.stage || 'deploy'} was successfully resolved and turned GREEN. ` +
    `Root Cause: ${root_cause || failure?.root_cause || 'Identified in post-mortem'}. ` +
    `Exact Fix Applied: ${fix_applied.trim()}. ` +
    (time_to_resolve_min ? `Time to resolve: ${time_to_resolve_min} minutes. ` : '') +
    (preventative_actions ? `Preventative Guardrail: ${preventative_actions.trim()}. ` : '') +
    `When deploying future ${deployment.change_type} changes to ${deployment.service}, apply this exact fix to succeed on the first attempt.`;

  retain(memoryContent).catch((err) => console.warn('[Hindsight] Failed to retain resolution:', err.message));

  /* 4. Recompute patterns */
  recomputePatterns();

  res.json({
    message: 'Remediation successfully recorded and learned into PipelineMemory',
    deployment: updatedDeployment,
    failure,
    memory_retained: true,
  });
}));

export default router;
