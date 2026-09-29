/**
 * Git & GitHub Branch Intelligence API Route
 *
 * Provides:
 *  - GET  /api/git/branches: Lists local git branches and scenarios (or GitHub branches)
 *  - POST /api/git/compare: Compares two branches (local or GitHub), generates unified diff & commits
 *  - POST /api/git/assess: Compares branches and immediately computes full Pre-Flight Risk Gate assessment
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getDb } from '../db/schema.js';
import { analyzeDiff } from '../services/diffAnalyzer.js';
import { computeRisk } from '../services/riskScorer.js';
import { findSimilarIncidents } from '../services/similarityEngine.js';
import { generateRiskExplanation, isLlmAvailable } from '../services/llmService.js';
import { recall, retain, buildFeedbackMemory, isHindsightAvailable } from '../services/hindsightService.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../');

const router = Router();

/* Pre-configured branch scenarios for instant one-click demonstration */
const BRANCH_PRESETS = [
  {
    branch: 'feature/db-migration-lock',
    service: 'payments',
    change_type: 'db_migration',
    title: 'Payments Unindexed Table Lock & Sync Query',
    description: 'Exclusive table lock via ALTER TABLE / DROP COLUMN on 10M rows + blocking sync query in Node request thread.',
    expected_risk: 'HIGH (82)',
    badge_color: 'red',
  },
  {
    branch: 'fix/idempotent-payments',
    service: 'payments',
    change_type: 'code',
    title: 'Safe Idempotency Check & Concurrent Index',
    description: 'Mandatory idempotencyKey validation, safe async error handling, and non-blocking CREATE INDEX CONCURRENTLY.',
    expected_risk: 'LOW (18)',
    badge_color: 'green',
  },
  {
    branch: 'feature/auth-jwt-leak',
    service: 'auth',
    change_type: 'config',
    title: 'Auth Production Secret Leak & 50ms Timeout',
    description: 'Hardcoded production secret in repository + severe 50ms downstream timeout causing cascading service failures.',
    expected_risk: 'CRITICAL (89)',
    badge_color: 'red',
  },
  {
    branch: 'perf/inventory-redis-cluster',
    service: 'inventory',
    change_type: 'code',
    title: 'Inventory Redis Cluster Cache Layer',
    description: 'Distributed cache cluster with connection pool (15), graceful in-memory fallback, and timeout safeguards.',
    expected_risk: 'MEDIUM (38)',
    badge_color: 'amber',
  },
];

/**
 * Helper to execute Git commands safely within the repo root
 */
async function runGit(args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PAGER: 'cat' },
    });
    return stdout;
  } catch (err) {
    throw new Error(`Git command failed [git ${args.join(' ')}]: ${err.stderr || err.message}`);
  }
}

/**
 * Detect primary service from changed file paths
 */
function detectService(files) {
  for (const f of files) {
    const match = f.match(/services\/([a-zA-Z0-9_-]+)\//);
    if (match && match[1]) {
      return match[1];
    }
  }
  return 'payments';
}

/**
 * Detect change type from file extensions and diff contents
 */
function detectChangeType(files, diff) {
  const hasSql = files.some(f => f.endsWith('.sql') || f.includes('migrations/'));
  if (hasSql || /ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE/i.test(diff)) {
    return 'db_migration';
  }
  const hasConfig = files.some(f => f.includes('config') || f.endsWith('.json') || f.endsWith('.env'));
  if (hasConfig) {
    return 'config';
  }
  const hasDep = files.some(f => f.endsWith('package.json') || f.endsWith('package-lock.json'));
  if (hasDep) {
    return 'dependency';
  }
  return 'code';
}

/**
 * GET /api/git/branches
 * Returns local branches, presets, and optional GitHub remote branches
 */
router.get('/branches', asyncHandler(async (req, res) => {
  const { githubRepo } = req.query;

  // Remote GitHub Repository
  if (githubRepo && typeof githubRepo === 'string' && githubRepo.includes('/')) {
    try {
      const headers = { 'User-Agent': 'PipelineMemory-Agent' };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const resp = await fetch(`https://api.github.com/repos/${githubRepo}/branches?per_page=30`, { headers });
      if (!resp.ok) {
        return res.status(resp.status).json({
          error: `GitHub API error: ${resp.statusText}`,
          githubRepo,
        });
      }
      const data = await resp.json();
      const branches = data.map(b => b.name);
      return res.json({
        source: 'github',
        repo: githubRepo,
        current_branch: 'main',
        branches,
        presets: [],
      });
    } catch (err) {
      return res.status(500).json({ error: `Failed to fetch GitHub branches: ${err.message}` });
    }
  }

  // Local Repository
  try {
    const branchOutput = await runGit(['branch', '--list', '--format=%(refname:short)']);
    const currentBranchOutput = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branches = branchOutput
      .split('\n')
      .map(b => b.trim())
      .filter(Boolean);

    const current_branch = currentBranchOutput.trim() || 'main';

    return res.json({
      source: 'local',
      repo: 'PipelineMemory',
      current_branch,
      branches,
      presets: BRANCH_PRESETS,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}));

/**
 * Core compare function
 */
async function performCompare({ base = 'main', head, githubRepo }) {
  if (!head) {
    throw new Error('Head / compare branch is required');
  }

  // Remote GitHub comparison
  if (githubRepo && githubRepo.includes('/')) {
    const headers = { 'User-Agent': 'PipelineMemory-Agent' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const url = `https://api.github.com/repos/${githubRepo}/compare/${base}...${head}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`GitHub comparison failed (${resp.status}): ${resp.statusText}`);
    }
    const data = await resp.json();

    const commits = (data.commits || []).map(c => ({
      hash: c.sha.slice(0, 7),
      author: c.commit.author.name,
      message: c.commit.message.split('\n')[0],
      date: c.commit.author.date,
    }));

    const files = (data.files || []).map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
    }));

    const diff = (data.files || []).map(f => f.patch || '').filter(Boolean).join('\n\n');
    const filenames = files.map(f => f.filename);
    const service = detectService(filenames);
    const change_type = detectChangeType(filenames, diff);
    const hazards = analyzeDiff(diff);

    return {
      source: 'github',
      repo: githubRepo,
      base,
      head,
      ahead_by: data.ahead_by,
      behind_by: data.behind_by,
      total_commits: data.total_commits || commits.length,
      commits,
      files,
      stats: {
        files_changed: files.length,
        lines_changed: (data.files || []).reduce((acc, f) => acc + f.changes, 0),
        additions: (data.files || []).reduce((acc, f) => acc + f.additions, 0),
        deletions: (data.files || []).reduce((acc, f) => acc + f.deletions, 0),
      },
      service,
      change_type,
      diff,
      hazards,
    };
  }

  // Local Git comparison
  const diffOutput = await runGit(['diff', `${base}...${head}`]);
  const logOutput = await runGit(['log', `${base}..${head}`, '--format=%H|||%an|||%s|||%ad', '--date=iso']);
  const numstatOutput = await runGit(['diff', '--numstat', `${base}...${head}`]);

  const commits = logOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [fullHash, author, message, date] = line.split('|||');
      return {
        hash: (fullHash || '').slice(0, 7),
        author: author || 'Developer',
        message: message || 'Commit',
        date: date || new Date().toISOString(),
      };
    });

  let totalAdditions = 0;
  let totalDeletions = 0;
  const files = numstatOutput
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [addStr, delStr, filename] = l.split(/\s+/);
      const additions = parseInt(addStr, 10) || 0;
      const deletions = parseInt(delStr, 10) || 0;
      totalAdditions += additions;
      totalDeletions += deletions;
      return {
        filename,
        status: additions > 0 && deletions === 0 ? 'added' : 'modified',
        additions,
        deletions,
        changes: additions + deletions,
      };
    });

  const filenames = files.map(f => f.filename);
  const service = detectService(filenames);
  const change_type = detectChangeType(filenames, diffOutput);
  const hazards = analyzeDiff(diffOutput);

  return {
    source: 'local',
    repo: 'PipelineMemory',
    base,
    head,
    total_commits: commits.length,
    commits,
    files,
    stats: {
      files_changed: files.length,
      lines_changed: totalAdditions + totalDeletions,
      additions: totalAdditions,
      deletions: totalDeletions,
    },
    service,
    change_type,
    diff: diffOutput,
    hazards,
  };
}

/**
 * POST /api/git/compare
 * Compares two branches and extracts commits, file stats, and unified diff
 */
router.post('/compare', asyncHandler(async (req, res) => {
  const { base = 'main', head, githubRepo } = req.body;
  if (!head) {
    return res.status(400).json({ error: 'head branch is required' });
  }

  const result = await performCompare({ base, head, githubRepo });
  return res.json(result);
}));

/**
 * POST /api/git/assess
 * Compares two branches and immediately computes full Pre-Flight Risk assessment
 */
router.post('/assess', asyncHandler(async (req, res) => {
  const { base = 'main', head, githubRepo, author } = req.body;
  if (!head) {
    return res.status(400).json({ error: 'head branch is required' });
  }

  // 1. Compare branches
  const compare = await performCompare({ base, head, githubRepo });

  // 2. Formulate change parameters for risk engine
  const change = {
    service: compare.service,
    change_type: compare.change_type,
    files_changed: compare.stats.files_changed,
    lines_changed: compare.stats.lines_changed,
    author: author || (compare.commits[0] ? compare.commits[0].author : 'DevOps Engineer'),
    timestamp: new Date().toISOString(),
    diff: compare.diff,
  };

  // 3. Compute Risk with static AST scanner & dynamic weights
  const { risk_score, risk_level, factors, recommendations, matchingPatterns, diffAnalysis } = computeRisk(change);

  // 4. Memory layer: Retrieve similar incidents from Hindsight Cloud or SQLite
  let similar_incidents = [];
  let hindsight_powered = false;

  if (isHindsightAvailable()) {
    try {
      const hazardTerms = diffAnalysis?.findings?.map(f => f.rule.replace(/_/g, ' ')).join(', ');
      const recallQuery = [
        `${change.change_type} change to ${change.service} service`,
        change.lines_changed > 0 ? `${change.lines_changed} lines changed` : '',
        hazardTerms ? `potential risks: ${hazardTerms}` : '',
        `branch ${head} vs ${base}`,
        `show me failures, incidents, and problems`,
      ].filter(Boolean).join(', ');

      const memories = await recall(recallQuery, 5);

      if (memories && memories.length > 0) {
        hindsight_powered = true;
        similar_incidents = memories.map((mem, idx) => ({
          deployment_id: idx + 1,
          service: change.service,
          change_type: change.change_type,
          timestamp: new Date().toISOString(),
          status: /failed|failure|rollback/i.test(mem) ? 'failed' : 'success',
          incident_summary: mem,
          similarity_score: 0.92 - idx * 0.05,
          source: 'hindsight',
        }));
      }
    } catch {
      hindsight_powered = false;
    }
  }

  if (similar_incidents.length === 0) {
    const sqliteSimilar = findSimilarIncidents(change, 3);
    similar_incidents = sqliteSimilar.map(inc => ({
      deployment_id: inc.id,
      service: inc.service,
      change_type: inc.change_type,
      timestamp: inc.timestamp,
      status: inc.status,
      lines_changed: inc.lines_changed,
      incident_summary: inc.incident_summary || null,
      incident_severity: inc.incident_severity || null,
      failure_message: inc.failure_message || null,
      similarity_score: inc.similarity_score,
      source: 'sqlite',
    }));
  }

  // 5. Generate AI risk explanation with remediation diff patch
  const explanation = await generateRiskExplanation({
    change,
    riskScore: risk_score,
    riskLevel: risk_level,
    factors,
    incidents: similar_incidents,
    patterns: matchingPatterns,
    recommendations,
    provenFixes: [],
  });

  return res.json({
    compare,
    assessment: {
      risk_score,
      risk_level,
      factors,
      recommendations,
      diff_analysis: diffAnalysis,
      matching_patterns: matchingPatterns,
      similar_incidents,
      explanation,
      hindsight_powered,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * POST /api/git/feedback
 * Records human-in-the-loop feedback on the Risk Gate suggestion and feeds it directly into Hindsight
 */
router.post('/feedback', asyncHandler(async (req, res) => {
  const {
    service = 'payments',
    head = 'target-branch',
    base = 'main',
    risk_score = 50,
    risk_level = 'moderate',
    satisfaction = 'not_satisfied', // 'satisfied' | 'not_satisfied'
    feedback_text = '',
    author = 'DevOps Engineer',
  } = req.body;

  const db = getDb();
  const timestamp = new Date().toISOString();

  // 1. Persist to SQLite
  const stmt = db.prepare(`
    INSERT INTO assessment_feedback (service, head_branch, base_branch, risk_score, risk_level, satisfaction, feedback_text, author, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(service, head, base, risk_score, risk_level, satisfaction, feedback_text, author, timestamp);

  // 2. Feed directly into Hindsight episodic memory
  let hindsight_synced = false;
  if (isHindsightAvailable()) {
    try {
      const memoryString = buildFeedbackMemory({
        service,
        head,
        base,
        risk_score,
        risk_level,
        satisfaction,
        feedback_text,
        author,
      });
      await retain(memoryString);
      hindsight_synced = true;
    } catch (err) {
      console.warn('[Feedback] Hindsight retain warning:', err.message);
    }
  }

  return res.json({
    success: true,
    id: info.lastInsertRowid,
    satisfaction,
    hindsight_synced,
    message: hindsight_synced
      ? 'Feedback successfully retained in Hindsight Cloud memory bank.'
      : 'Feedback saved to local memory.',
  });
}));

export default router;
