/**
 * Diff Analyzer — static code inspection & risk detection for git diffs.
 *
 * Scans code changes / patches for:
 *   - Destructive or blocking database migrations (ALTER TABLE locks, DROP COLUMN)
 *   - Concurrency & latency bottlenecks (sync I/O, sleep, unbounded queries)
 *   - Resilience & config regressions (pool size reductions, dropped timeouts)
 *   - Security risks (hardcoded secrets, disabled TLS)
 *
 * Extracts files touched, lines added/removed, and produces structured findings
 * with suggested remediations for the risk scoring engine and LLM prompt.
 */

export function analyzeDiff(diffText) {
  if (!diffText || typeof diffText !== 'string' || !diffText.trim()) {
    return {
      hasDiff: false,
      stats: { filesChanged: 0, additions: 0, deletions: 0, totalLines: 0 },
      findings: [],
      riskScore: 0,
      summary: 'No code diff provided.',
    };
  }

  const lines = diffText.split('\n');
  const filesTouched = new Set();
  let additions = 0;
  let deletions = 0;
  let currentFile = 'unknown';

  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    /* Detect file headers */
    const gitFileMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (gitFileMatch) {
      currentFile = gitFileMatch[2];
      filesTouched.add(currentFile);
      continue;
    }
    const plusFileMatch = line.match(/^\+\+\+ b\/(.+?)$/);
    if (plusFileMatch) {
      currentFile = plusFileMatch[1];
      filesTouched.add(currentFile);
      continue;
    }

    /* Count additions and deletions (excluding hunk headers) */
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
      const addedContent = line.slice(1).trim();

      /* Check rules against added lines */
      runStaticChecks(addedContent, currentFile, i + 1, findings);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
      const removedContent = line.slice(1).trim();

      /* Check rules against removed lines (e.g. removed timeouts, removed index) */
      runRemovalChecks(removedContent, currentFile, i + 1, findings);
    }
  }

  /* Compute risk contribution from findings */
  let severityWeight = 0;
  for (const f of findings) {
    if (f.severity === 'critical') severityWeight += 40;
    else if (f.severity === 'high') severityWeight += 25;
    else if (f.severity === 'medium') severityWeight += 15;
    else severityWeight += 5;
  }

  const riskScore = Math.min(100, Math.max(0, severityWeight));

  const totalLines = additions + deletions;
  const filesChanged = filesTouched.size || (totalLines > 0 ? 1 : 0);

  let summary = 'Code diff inspected: no high-risk anti-patterns detected.';
  if (findings.length > 0) {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    summary = `Detected ${findings.length} code anti-pattern${findings.length > 1 ? 's' : ''} (${criticalCount} critical, ${highCount} high).`;
  }

  return {
    hasDiff: true,
    stats: {
      filesChanged,
      additions,
      deletions,
      totalLines,
      files: Array.from(filesTouched),
    },
    findings,
    riskScore,
    summary,
  };
}

/**
 * Runs pattern checks against newly added code lines.
 */
function runStaticChecks(line, file, lineNum, findings) {
  if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) {
    return;
  }

  /* 1. Database Schema Alterations & Lock Hazards */
  if (/ALTER\s+TABLE/i.test(line)) {
    if (!/CONCURRENTLY/i.test(line)) {
      findings.push({
        rule: 'DB_EXCLUSIVE_TABLE_LOCK',
        severity: 'critical',
        file,
        line: lineNum,
        snippet: line,
        description: 'Unindexed or non-concurrent ALTER TABLE detected; risks exclusive table lock during high traffic.',
        remediation: 'Apply migration with CREATE INDEX CONCURRENTLY or execute out-of-hours in phased batches.',
      });
    }
  }

  if (/DROP\s+COLUMN/i.test(line)) {
    findings.push({
      rule: 'DB_DROP_COLUMN_BREAKING',
      severity: 'critical',
      file,
      line: lineNum,
      snippet: line,
      description: 'DROP COLUMN can break active running pods/replicas reading old schema columns.',
      remediation: 'Follow expand-contract deploy pattern: stop referencing column in code first, then drop column in a later release.',
    });
  }

  if (/ADD\s+COLUMN\s+.*NOT\s+NULL/i.test(line) && !/DEFAULT/i.test(line)) {
    findings.push({
      rule: 'DB_NOT_NULL_NO_DEFAULT',
      severity: 'high',
      file,
      line: lineNum,
      snippet: line,
      description: 'Adding NOT NULL column without DEFAULT value causes table rewrite and fails on existing rows.',
      remediation: 'Add column as NULLABLE, backfill existing records asynchronously, then alter to NOT NULL.',
    });
  }

  if (/DROP\s+TABLE|TRUNCATE/i.test(line)) {
    findings.push({
      rule: 'DB_DESTRUCTIVE_OPERATION',
      severity: 'critical',
      file,
      line: lineNum,
      snippet: line,
      description: 'Destructive table drop or truncate detected in migration script.',
      remediation: 'Verify data archival and ensure snapshot backup before running in production.',
    });
  }

  /* 2. Concurrency & Synchronous Bottlenecks */
  if (/Thread\.sleep|readFileSync|execSync/i.test(line)) {
    findings.push({
      rule: 'SYNC_BLOCKING_OPERATION',
      severity: 'high',
      file,
      line: lineNum,
      snippet: line,
      description: 'Synchronous blocking execution detected in request execution path; risks worker starvation.',
      remediation: 'Replace with asynchronous non-blocking calls or delegate to a background job worker.',
    });
  }

  if (/(?:setTimeout|setInterval)\s*\([^,]+,\s*(?:0|[1-9]\d{0,2})\)/.test(line) && /while\s*\(true\)/.test(line)) {
    findings.push({
      rule: 'TIGHT_LOOP_CPU_SPIKE',
      severity: 'high',
      file,
      line: lineNum,
      snippet: line,
      description: 'Tight looping construct risks saturating event loop and spiking CPU utilization.',
      remediation: 'Introduce proper backoff intervals or reactive event listeners.',
    });
  }

  /* 3. Unbounded Queries */
  if (/SELECT\s+\*\s+FROM/i.test(line) && !/LIMIT/i.test(line) && !line.includes('WHERE id =')) {
    findings.push({
      rule: 'DB_UNBOUNDED_SELECT',
      severity: 'medium',
      file,
      line: lineNum,
      snippet: line,
      description: 'Unbounded SELECT query without LIMIT clause detected; risks memory exhaustion at scale.',
      remediation: 'Add pagination (LIMIT/OFFSET or cursor-based) and select only required column projections.',
    });
  }

  /* 4. Resilience & Network Regressions */
  if (/(?:timeout|timeoutMs|requestTimeout)\s*[:=]\s*([0-9]+)/i.test(line)) {
    const match = line.match(/(?:timeout|timeoutMs|requestTimeout)\s*[:=]\s*([0-9]+)/i);
    const ms = match ? parseInt(match[1], 10) : null;
    if (ms !== null && ms < 500 && ms > 0) {
      findings.push({
        rule: 'AGGRESSIVE_TIMEOUT_THRESHOLD',
        severity: 'high',
        file,
        line: lineNum,
        snippet: line,
        description: `Very low timeout (${ms}ms) may cause premature request aborts and cascading retry storms under jitter.`,
        remediation: 'Set timeout to at least p99 + safety buffer (e.g. >= 2000ms) with exponential backoff.',
      });
    }
  }

  if (/(?:maxConnections|poolSize|connectionLimit)\s*[:=]\s*([0-9]+)/i.test(line)) {
    const match = line.match(/(?:maxConnections|poolSize|connectionLimit)\s*[:=]\s*([0-9]+)/i);
    const pool = match ? parseInt(match[1], 10) : null;
    if (pool !== null && pool < 5) {
      findings.push({
        rule: 'RESTRICTED_CONNECTION_POOL',
        severity: 'high',
        file,
        line: lineNum,
        snippet: line,
        description: `Connection pool size constrained to ${pool}; can cause connection queueing bottlenecks under concurrency.`,
        remediation: 'Maintain appropriate connection pooling (typically 20-50 per replica) with idle timeouts.',
      });
    }
  }

  if (/rejectUnauthorized\s*:\s*false/i.test(line) || /INSECURE_SKIP_VERIFY/i.test(line)) {
    findings.push({
      rule: 'SECURITY_TLS_VALIDATION_DISABLED',
      severity: 'critical',
      file,
      line: lineNum,
      snippet: line,
      description: 'TLS certificate verification explicitly disabled; susceptible to MITM attacks.',
      remediation: 'Provide valid CA certificates instead of disabling security verification.',
    });
  }

  /* 5. Hardcoded Credentials */
  if (/(?:api_key|apiKey|secret|private_key|password)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i.test(line)) {
    findings.push({
      rule: 'SECURITY_HARDCODED_SECRET',
      severity: 'critical',
      file,
      line: lineNum,
      snippet: line.replace(/['"][a-zA-Z0-9_\-]{8,}['"]/, '"***REDACTED***"'),
      description: 'Possible hardcoded API key, token, or password found directly in source diff.',
      remediation: 'Load secrets from environment variables or a secure key-vault / KMS.',
    });
  }
}

/**
 * Runs checks on removed code lines (regressions from deletion).
 */
function runRemovalChecks(line, file, lineNum, findings) {
  if (/CREATE\s+INDEX/i.test(line)) {
    findings.push({
      rule: 'DB_INDEX_REMOVED',
      severity: 'high',
      file,
      line: lineNum,
      snippet: line,
      description: 'Removal of database index detected; can cause full table scans on active query paths.',
      remediation: 'Verify query execution plans via EXPLAIN ANALYZE before removing production indexes.',
    });
  }

  if (/(?:catch\s*\(|onError|handleError)/i.test(line)) {
    findings.push({
      rule: 'ERROR_HANDLING_REMOVED',
      severity: 'medium',
      file,
      line: lineNum,
      snippet: line,
      description: 'Error handler or catch block removed; unhandled exceptions may trigger container crashes.',
      remediation: 'Ensure centralized error middleware or fallback handlers capture these failure cases.',
    });
  }
}
