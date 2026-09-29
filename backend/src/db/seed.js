/**
 * Seed script for PipelineMemory — Production-Grade DevOps Telemetry Dataset.
 *
 * Generates ~64 authentic, enterprise-grade deployment records across 6 microservices
 * with realistic Git commits, semver versions, Kubernetes/Postgres/Envoy stack traces,
 * root causes, and proven remediation fixes that turned failed builds green.
 *
 * Seeded Core Scenarios & Patterns:
 *   1. Friday DB Migrations (Schema deadlocks under analytics batch reconciliation)
 *   2. Payments Config Drift -> Checkout Timeout Cascade (TCP keep-alive mismatch)
 *   3. Large Monolithic Changes (>500 lines) triggering Envoy route cache OOM
 *   4. Gateway gRPC / Alpine base image dependency mismatches
 *   5. Real closed-loop remediation playbooks stored for every failure!
 *
 * Run: npm run seed
 */

import 'dotenv/config';
import { resetDatabase, getDb } from './schema.js';
import { recomputePatterns } from '../services/patternLearner.js';
import {
  bulkRetain, clearBank, isHindsightAvailable,
  buildDeploymentMemory, buildFailureMemory,
  buildIncidentMemory, buildPatternMemory,
} from '../services/hindsightService.js';

/* ================================================================== */
/*  Deterministic PRNG for reproducible seed data                      */
/* ================================================================== */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

/* ================================================================== */
/*  Production Constants & Service Profiles                            */
/* ================================================================== */
const SERVICES = ['auth', 'payments', 'checkout', 'inventory', 'notifications', 'gateway'];
const AUTHORS = ['sarah.chen', 'alex.rodriguez', 'marcus.vance', 'elena.rostova', 'pranay', 'dave.miller'];
const ENVIRONMENTS = ['production', 'production', 'production', 'staging'];

const NOW = new Date('2026-09-28T16:00:00+05:30');

/* Curated production-grade incident post-mortem playbooks */
const INCIDENT_PLAYBOOKS = [
  {
    key: 'payments_deadlock',
    service: 'payments',
    stage: 'deploy',
    error_message: 'PostgreSQL 16: ActiveRecord::Deadlocked: PG::TRDeadlockDetected: ALTER TABLE ledger_entries ADD COLUMN transaction_hash VARCHAR(64); AccessExclusiveLock blocked by pg_stat_activity PID 41209.',
    root_cause: 'Analytics reconciliation cron job held shared AccessShareLock on ledger_entries. DDL ALTER TABLE waited indefinitely without lock_timeout, queueing behind write transactions and starving the database pool.',
    fix_applied: '1) Terminated blocking analytics PID 41209; 2) Injected "SET lock_timeout = \'2s\';" in pre-migration hook; 3) Re-executed migration using zero-downtime batching during 03:00 UTC maintenance; 4) Canary deploy v4.19.1 passed all synthetic payment health checks.',
    time_to_resolve_min: 18,
    preventative_actions: 'Enforced CI linter rule requiring explicit lock_timeout on all Postgres migrations touching tables with >1M rows.',
    notes: 'feat(ledger): partition ledger_entries by quarter and add transaction_hash (PR #1482)',
    diff: `diff --git a/migrations/20260814_ledger_partition.sql b/migrations/20260814_ledger_partition.sql
--- a/migrations/20260814_ledger_partition.sql
+++ b/migrations/20260814_ledger_partition.sql
@@ -14,3 +14,5 @@
+ALTER TABLE ledger_entries ADD COLUMN transaction_hash VARCHAR(64) NOT NULL;
+ALTER TABLE ledger_entries ADD PARTITION (PARTITION p_2026_q3 VALUES LESS THAN ('2026-10-01'));`,
  },
  {
    key: 'payments_pool_cascade',
    service: 'payments',
    stage: 'deploy',
    error_message: 'HTTP 504 Gateway Timeout: POST /v1/checkout/charge timed out after 3000ms. Checkout BullMQ queue stalled with 3,840 pending cart reservations.',
    root_cause: 'Payments config reduced HTTP connection pool idleTimeoutMillis from 30s to 4s. Under 1,200 RPS peak load, aggressive connection recycling caused continuous TLS handshakes, exhausting upstream socket limits and cascading 504s into checkout-orchestrator.',
    fix_applied: '1) Hot-patched Kubernetes ConfigMap restoring keepAliveTimeout to 65s and maxSockets to 300; 2) Executed rolling restart of payments pods; 3) Flushed and replayed BullMQ dead-letter queue; 4) P99 checkout latency dropped from 3,200ms to 48ms.',
    time_to_resolve_min: 24,
    preventative_actions: 'Added cross-service blast radius validation gate in CI/CD pipeline to block connection pool reductions affecting downstream consumers.',
    notes: 'config(pool): optimize database pool idle timeout and connection eviction (PR #1466)',
    diff: `diff --git a/services/payments/config.yaml b/services/payments/config.yaml
--- a/services/payments/config.yaml
+++ b/services/payments/config.yaml
@@ -12,4 +12,4 @@
 database:
-  idleTimeoutMillis: 30000
-  maxConnections: 50
+  idleTimeoutMillis: 4000
+  maxConnections: 4`,
  },
  {
    key: 'gateway_oom',
    service: 'gateway',
    stage: 'deploy',
    error_message: 'Kubernetes OOMKilled: pod gateway-edge-7f89d-92xk exited with code 137. Container memory usage reached 1024Mi limit during Envoy dynamic route table compilation.',
    root_cause: 'Large 720-line PR bundled 45+ unoptimized regex path routing patterns into Envoy ingress config without pre-compiled radix trie indices, exhausting JVM heap memory during route warming.',
    fix_applied: '1) Converted greedy regex route patterns into prefix-matched path clusters; 2) Updated Envoy route cache memory allocation to 1536Mi in production Helm values; 3) Re-deployed with staged rolling restart; 4) Passed 5,000 RPS soak test with zero dropped packets.',
    time_to_resolve_min: 32,
    preventative_actions: 'Enforced PR size limit (<400 lines) and automated Envoy memory profiling in staging benchmark suite.',
    notes: 'feat(ingress): add enterprise multi-tenant path routing and header rewriting rules (PR #1440)',
    diff: `diff --git a/ingress/envoy.yaml b/ingress/envoy.yaml
--- a/ingress/envoy.yaml
+++ b/ingress/envoy.yaml
@@ -45,3 +45,6 @@
+        - match: { safe_regex: { regex: "^/api/v[0-9]+/orgs/.*" } }
+          route: { cluster: multi_tenant_backend }`,
  },
  {
    key: 'gateway_grpc_conflict',
    service: 'gateway',
    stage: 'build',
    error_message: 'Docker build failed: npm ERR! peer dep conflict @grpc/grpc-js@1.10.8 requires @types/node@>=18.11.0 but base Docker image pinned to node:16-alpine.',
    root_cause: 'Dependency upgrade PR bumped @grpc/grpc-js without aligning the multi-stage Dockerfile base image, causing npm ci lockfile verification to reject glibc/musl bindings.',
    fix_applied: '1) Updated Dockerfile base image from node:16-alpine to node:20.12-alpine3.19; 2) Re-generated package-lock.json with npm v10; 3) Invalidated GitHub Actions runner layer cache; 4) Re-ran CI pipeline which compiled cleanly in 78 seconds.',
    time_to_resolve_min: 14,
    preventative_actions: 'Added automated Renovate bot rule enforcing paired runtime base image upgrades whenever transport protocol dependencies are bumped.',
    notes: 'chore(deps): bump @grpc/grpc-js from 1.9.4 to 1.10.8 and update protobuf bindings (PR #1428)',
    diff: `diff --git a/services/gateway/package.json b/services/gateway/package.json
--- a/services/gateway/package.json
+++ b/services/gateway/package.json
@@ -18,3 +18,3 @@
-    "@grpc/grpc-js": "1.9.4"
+    "@grpc/grpc-js": "1.10.8"`,
  },
  {
    key: 'inventory_lock_friday',
    service: 'inventory',
    stage: 'deploy',
    error_message: 'ActiveRecord::LockWaitTimeout: Lock wait timeout exceeded (50s): ALTER TABLE warehouse_stock ADD CONSTRAINT fk_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id).',
    root_cause: 'Adding foreign key constraint without NOT VALID keyword triggered full table validation scan while warehouse inventory scanners were actively updating Friday 5 PM stock balances.',
    fix_applied: '1) Aborted blocking schema lock; 2) Re-executed migration using "ALTER TABLE warehouse_stock ADD CONSTRAINT fk_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) NOT VALID;"; 3) Ran asynchronous constraint validation off-peak; 4) Deployed green.',
    time_to_resolve_min: 19,
    preventative_actions: 'Enforced PostgreSQL safe migration patterns in GitHub Actions pre-merge check.',
    notes: 'migration(stock): add foreign key constraint between warehouse_stock and warehouses (PR #1412)',
    diff: `diff --git a/migrations/20260718_stock_fk.sql b/migrations/20260718_stock_fk.sql
--- a/migrations/20260718_stock_fk.sql
+++ b/migrations/20260718_stock_fk.sql
@@ -8,3 +8,4 @@
+ALTER TABLE warehouse_stock ADD CONSTRAINT fk_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);`,
  },
  {
    key: 'checkout_timeout',
    service: 'checkout',
    stage: 'test',
    error_message: 'FAIL test/integration/checkout_saga.test.ts: Timeout (15000ms) waiting for inventory-service stock reservation response on simulated network partition.',
    root_cause: 'Checkout orchestrator lacked circuit breaker fallback for inventory RPC failures, causing worker threads to hang indefinitely when inventory response exceeded 500ms.',
    fix_applied: '1) Implemented Opossum circuit breaker with 800ms timeout and cached inventory fallback in checkout saga; 2) Added unit and integration tests verifying circuit opening; 3) Re-ran test suite which passed green in 38s.',
    time_to_resolve_min: 25,
    preventative_actions: 'Made circuit breaker timeout decorators mandatory on all inter-service RPC client calls.',
    notes: 'feat(saga): implement order placement checkout coordinator with payment authorization (PR #1398)',
  },
];

/* Real production infra resources */
const INFRA_RESOURCES = [
  'AWS Aurora PostgreSQL 16.2 Cluster (Writer: r6g.2xlarge)',
  'Amazon ElastiCache Redis 7.1 Cluster (3-node cluster mode)',
  'AWS Network Load Balancer (NLB) & Cloudflare Edge Ingress',
  'EKS CoreDNS & Kubernetes Cluster Autoscaler NodeGroup',
  'AWS SQS FIFO Queue (checkout-settlement.fifo)',
  'HashiCorp Vault Production Secret Engine (us-east-1)',
];

/* ================================================================== */
/*  Deployment Generator                                               */
/* ================================================================== */

function generateDeployments() {
  const deployments = [];

  /* Structured 90-day deployment schedule with deterministic real-world patterns */
  const deploymentSchedule = [
    /* --- Month 1: Initial stabilization & baseline releases --- */
    { day: 2,  service: 'gateway',       type: 'code',         lines: 110, status: 'success', author: 'dave.miller',    notes: 'feat(rate-limit): configure redis token bucket rate limiter for public api (PR #1340)' },
    { day: 3,  service: 'auth',          type: 'code',         lines: 85,  status: 'success', author: 'sarah.chen',    notes: 'feat(oauth): add PKCE verification support for mobile clients (PR #1342)' },
    { day: 5,  service: 'payments',      type: 'code',         lines: 190, status: 'success', author: 'alex.rodriguez', notes: 'feat(stripe): integrate 3D-Secure 2.0 biometric challenge handler (PR #1348)' },
    { day: 7,  service: 'checkout',      type: 'code',         lines: 140, status: 'success', author: 'marcus.vance',   notes: 'perf(cart): optimize checkout session serialization in redis cache (PR #1352)' },
    { day: 9,  service: 'inventory',     type: 'code',         lines: 95,  status: 'success', author: 'elena.rostova',  notes: 'feat(sku): add multi-currency price conversion for international warehouses (PR #1355)' },
    { day: 10, service: 'notifications', type: 'code',         lines: 65,  status: 'success', author: 'sarah.chen',    notes: 'feat(email): migrate transactional order confirmation templates to sendgrid v3 (PR #1358)' },
    { day: 12, service: 'gateway',       type: 'dependency',   lines: 45,  status: 'success', author: 'dave.miller',    notes: 'chore(deps): update express and helmet security headers (PR #1362)' },

    /* --- Week 3: Friday DB Migration Failure (Pattern 1) --- */
    { day: 15, service: 'payments',      type: 'config',       lines: 28,  status: 'success', author: 'alex.rodriguez', notes: 'config(stripe): update webhook signing secret for production rotation (PR #1368)' },
    { day: 17, service: 'auth',          type: 'code',         lines: 115, status: 'success', author: 'sarah.chen',    notes: 'feat(rbac): implement fine-grained role claims in JWT payload (PR #1371)' },
    { day: 19, service: 'inventory',     type: 'db_migration', lines: 60,  status: 'failed',  author: 'elena.rostova',  isFriday: true, playbook: 'inventory_lock_friday' },
    { day: 20, service: 'gateway',       type: 'code',         lines: 160, status: 'success', author: 'dave.miller',    notes: 'feat(cors): restrict access-control-allow-origin to verified partner domains (PR #1377)' },

    /* --- Week 4: Payments Config Drift -> Checkout Cascade (Pattern 2) --- */
    { day: 22, service: 'payments',      type: 'config',       lines: 32,  status: 'failed',  author: 'alex.rodriguez', cascade: true, playbook: 'payments_pool_cascade' },
    { day: 23, service: 'checkout',      type: 'code',         lines: 105, status: 'success', author: 'marcus.vance',   notes: 'fix(reconciliation): handle partial order cancelation in saga compensator (PR #1383)' },
    { day: 25, service: 'auth',          type: 'code',         lines: 70,  status: 'success', author: 'sarah.chen',    notes: 'refactor(jwks): cache RSA public keys with 24h TTL and background refresh (PR #1387)' },
    { day: 26, service: 'notifications', type: 'code',         lines: 45,  status: 'success', author: 'elena.rostova',  notes: 'fix(sms): add exponential backoff retry for twilio rate-limited dispatch (PR #1390)' },

    /* --- Week 5: Large Deploy Failures (>500 lines) (Pattern 3) --- */
    { day: 29, service: 'gateway',       type: 'code',         lines: 720, status: 'failed',  author: 'dave.miller',    bigDeploy: true, playbook: 'gateway_oom' },
    { day: 30, service: 'payments',      type: 'code',         lines: 95,  status: 'success', author: 'alex.rodriguez', notes: 'fix(idempotency): store stripe charge idempotency keys in postgres ledger (PR #1396)' },
    { day: 32, service: 'checkout',      type: 'db_migration', lines: 35,  status: 'success', author: 'marcus.vance',   notes: 'migration(orders): add index on orders (created_at, customer_id) (PR #1401)' },
    { day: 33, service: 'inventory',     type: 'code',         lines: 190, status: 'success', author: 'elena.rostova',  notes: 'feat(allocation): prioritize fulfillment center by geo-distance coordinates (PR #1405)' },

    /* --- Week 6: Gateway Dependency Issue & Cascades --- */
    { day: 35, service: 'auth',          type: 'db_migration', lines: 50,  status: 'success', author: 'sarah.chen',    notes: 'migration(users): create table auth_session_tokens with cascade deletes (PR #1410)' },
    { day: 37, service: 'payments',      type: 'config',       lines: 22,  status: 'failed',  author: 'alex.rodriguez', cascade: true, playbook: 'payments_pool_cascade' },
    { day: 38, service: 'gateway',       type: 'dependency',   lines: 85,  status: 'failed',  author: 'dave.miller',    playbook: 'gateway_grpc_conflict' },
    { day: 39, service: 'notifications', type: 'code',         lines: 55,  status: 'success', author: 'marcus.vance',   notes: 'perf(sqs): increase batch size from 5 to 10 messages per consumer poll (PR #1418)' },

    /* --- Week 7: Friday Payments Migration Deadlock (Pattern 1) --- */
    { day: 40, service: 'checkout',      type: 'code',         lines: 175, status: 'success', author: 'marcus.vance',   notes: 'feat(discounts): apply promotional coupon validation rule engine (PR #1422)' },
    { day: 42, service: 'payments',      type: 'db_migration', lines: 75,  status: 'failed',  author: 'pranay',         isFriday: true, playbook: 'payments_deadlock' },
    { day: 43, service: 'auth',          type: 'code',         lines: 60,  status: 'success', author: 'sarah.chen',    notes: 'fix(session): invalidate redis session token on user password change (PR #1429)' },
    { day: 44, service: 'inventory',     type: 'config',       lines: 30,  status: 'success', author: 'elena.rostova',  notes: 'config(redis): enable cluster auto-failover with 15s health check probe (PR #1432)' },

    /* --- Week 8: Large PR Failures continue --- */
    { day: 46, service: 'checkout',      type: 'code',         lines: 580, status: 'failed',  author: 'marcus.vance',   bigDeploy: true, playbook: 'checkout_timeout' },
    { day: 47, service: 'gateway',       type: 'infra',        lines: 95,  status: 'success', author: 'dave.miller',    notes: 'infra(nlb): configure cross-zone load balancing on AWS NLB target group (PR #1439)' },
    { day: 49, service: 'payments',      type: 'code',         lines: 280, status: 'success', author: 'alex.rodriguez', notes: 'feat(refunds): support partial ACH refund settlement reconciliation (PR #1445)' },
    { day: 50, service: 'auth',          type: 'code',         lines: 48,  status: 'success', author: 'sarah.chen',    notes: 'security(audit): log tenant authentication failures to cloudwatch security lake (PR #1449)' },

    /* --- Week 9: Payments Config -> Checkout Cascade (3rd Occurrence) --- */
    { day: 52, service: 'payments',      type: 'config',       lines: 18,  status: 'failed',  author: 'pranay',         cascade: true, playbook: 'payments_pool_cascade' },
    { day: 53, service: 'notifications', type: 'dependency',   lines: 70,  status: 'success', author: 'marcus.vance',   notes: 'chore(deps): update @aws-sdk/client-sqs to v3.590.0 (PR #1454)' },
    { day: 54, service: 'inventory',     type: 'code',         lines: 135, status: 'success', author: 'elena.rostova',  notes: 'fix(lock): acquire optimistic lock on warehouse inventory balance updates (PR #1457)' },
    { day: 56, service: 'gateway',       type: 'code',         lines: 680, status: 'failed',  author: 'dave.miller',    bigDeploy: true, playbook: 'gateway_oom' },

    /* --- Week 10: Mixed Successful Deploys --- */
    { day: 57, service: 'checkout',      type: 'code',         lines: 80,  status: 'success', author: 'marcus.vance',   notes: 'feat(analytics): dispatch order checkout latency metrics to datadog (PR #1464)' },
    { day: 59, service: 'auth',          type: 'config',       lines: 20,  status: 'success', author: 'sarah.chen',    notes: 'config(cors): add staging web app subdomain to trusted origins (PR #1467)' },
    { day: 61, service: 'gateway',       type: 'db_migration', lines: 40,  status: 'success', author: 'dave.miller',    isFriday: true, notes: 'migration(routes): add table dynamic_api_keys with hash index (PR #1471)' },
    { day: 62, service: 'inventory',     type: 'code',         lines: 65,  status: 'success', author: 'elena.rostova',  notes: 'perf(query): rewrite item stock count aggregation using cte expression (PR #1474)' },

    /* --- Week 11: Cross-Service Activity --- */
    { day: 64, service: 'payments',      type: 'code',         lines: 240, status: 'success', author: 'alex.rodriguez', notes: 'feat(ledger): generate daily GAAP financial summary reports for accounting (PR #1478)' },
    { day: 65, service: 'checkout',      type: 'dependency',   lines: 85,  status: 'success', author: 'marcus.vance',   notes: 'chore(deps): update joi request payload validation library (PR #1481)' },
    { day: 66, service: 'auth',          type: 'code',         lines: 38,  status: 'success', author: 'sarah.chen',    notes: 'fix(jwt): normalize subject claims for service account authentication (PR #1484)' },
    { day: 67, service: 'gateway',       type: 'config',       lines: 42,  status: 'success', author: 'dave.miller',    notes: 'config(waf): update aws waf v2 rule set with rate limiting per ip (PR #1487)' },
    { day: 68, service: 'notifications', type: 'code',         lines: 110, status: 'success', author: 'elena.rostova',  notes: 'feat(push): add apple push notification service token authentication (PR #1490)' },

    /* --- Week 12: Friday DB Migration Failure --- */
    { day: 70, service: 'payments',      type: 'code',         lines: 175, status: 'success', author: 'pranay',         notes: 'feat(disputes): ingest chargeback webhooks from stripe dispute api (PR #1493)' },
    { day: 71, service: 'inventory',     type: 'db_migration', lines: 80,  status: 'failed',  author: 'elena.rostova',  isFriday: true, playbook: 'inventory_lock_friday' },
    { day: 72, service: 'checkout',      type: 'code',         lines: 90,  status: 'success', author: 'marcus.vance',   notes: 'fix(timeout): increase stripe checkout session creation timeout to 4000ms (PR #1497)' },
    { day: 73, service: 'auth',          type: 'code',         lines: 48,  status: 'success', author: 'sarah.chen',    notes: 'feat(mfa): support totp authenticator app enrollment for admins (PR #1500)' },

    /* --- Week 13: Recent Deployments (High Fragility Streak on Payments) --- */
    { day: 75, service: 'gateway',       type: 'code',         lines: 620, status: 'rolled_back', author: 'dave.miller', bigDeploy: true, playbook: 'gateway_oom' },
    { day: 76, service: 'payments',      type: 'config',       lines: 12,  status: 'success', author: 'alex.rodriguez', notes: 'config(reconciliation): adjust automated settlement batch window (PR #1505)' },
    { day: 78, service: 'checkout',      type: 'code',         lines: 135, status: 'success', author: 'marcus.vance',   notes: 'feat(abandoned-cart): emit kafka event on checkout session expiry (PR #1508)' },
    { day: 79, service: 'notifications', type: 'infra',        lines: 80,  status: 'success', author: 'sarah.chen',    notes: 'infra(sqs): increase sqs message retention period to 7 days (PR #1511)' },
    { day: 80, service: 'inventory',     type: 'code',         lines: 105, status: 'success', author: 'elena.rostova',  notes: 'feat(backorder): support automated backorder fulfillment queue (PR #1514)' },
    { day: 82, service: 'auth',          type: 'dependency',   lines: 50,  status: 'success', author: 'sarah.chen',    notes: 'chore(deps): bump jose library and verify RS256 token verification (PR #1518)' },

    /* --- Recent Week: Dave Gateway issue & High-Profile Payments Failures --- */
    { day: 84, service: 'gateway',       type: 'dependency',   lines: 95,  status: 'failed',  author: 'dave.miller',    playbook: 'gateway_grpc_conflict' },
    { day: 85, service: 'payments',      type: 'db_migration', lines: 65,  status: 'failed',  author: 'pranay',         isFriday: true, playbook: 'payments_deadlock' },
    { day: 86, service: 'checkout',      type: 'code',         lines: 75,  status: 'success', author: 'marcus.vance',   notes: 'fix(retry): implement jittered backoff on payment authorization calls (PR #1525)' },
    { day: 87, service: 'auth',          type: 'code',         lines: 42,  status: 'success', author: 'sarah.chen',    notes: 'perf(cache): use multi-key mget for session token retrieval (PR #1528)' },
    { day: 88, service: 'inventory',     type: 'code',         lines: 155, status: 'success', author: 'elena.rostova',  notes: 'refactor(stock): extract warehouse inventory reservation into service object (PR #1531)' },
    { day: 89, service: 'payments',      type: 'db_migration', lines: 850, status: 'failed',  author: 'pranay',         playbook: 'payments_deadlock' },
  ];

  const playbookMap = {};
  for (const pb of INCIDENT_PLAYBOOKS) playbookMap[pb.key] = pb;

  let versionCounters = { auth: [3, 4, 10], payments: [4, 18, 0], checkout: [2, 14, 5], inventory: [2, 7, 20], notifications: [1, 9, 30], gateway: [3, 13, 0] };

  for (const item of deploymentSchedule) {
    const timestamp = new Date(NOW.getTime() - (90 - item.day) * 24 * 60 * 60 * 1000);

    /* If marked as Friday, calibrate day */
    if (item.isFriday) {
      const currentDay = timestamp.getDay();
      const daysUntilFriday = (5 - currentDay + 7) % 7;
      timestamp.setDate(timestamp.getDate() + daysUntilFriday);
      timestamp.setHours(16, randInt(10, 45)); // Friday 4:30 PM release
    } else {
      timestamp.setHours(10 + randInt(0, 6), randInt(0, 59));
    }

    const vc = versionCounters[item.service] || [1, 0, 0];
    vc[2]++;
    const version = `v${vc[0]}.${vc[1]}.${vc[2]}`;

    const pb = item.playbook ? playbookMap[item.playbook] : null;

    deployments.push({
      service: item.service,
      version: version,
      author: item.author || pick(AUTHORS),
      timestamp: timestamp.toISOString(),
      environment: pick(ENVIRONMENTS),
      status: item.status,
      duration_sec: item.status === 'success' ? randInt(35, 180) : randInt(60, 420),
      files_changed: Math.max(1, Math.round(item.lines / randInt(12, 28))),
      lines_changed: item.lines,
      change_type: item.type,
      notes: pb?.notes || item.notes || `Production release for ${item.service} (v${version})`,
      _cascade: item.cascade || false,
      _bigDeploy: item.bigDeploy || false,
      _isFriday: item.isFriday || false,
      _playbook: pb,
    });
  }

  return deployments;
}

/* ================================================================== */
/*  Main Seed Execution                                                */
/* ================================================================== */

async function seed() {
  console.log('🚀 Initializing Production-Grade PipelineMemory Database...\n');

  resetDatabase();
  const db = getDb();

  const deployments = generateDeployments();

  const insertDeploy = db.prepare(`
    INSERT INTO deployments (service, version, author, timestamp, environment, status, duration_sec, files_changed, lines_changed, change_type, notes, diff)
    VALUES (@service, @version, @author, @timestamp, @environment, @status, @duration_sec, @files_changed, @lines_changed, @change_type, @notes, @diff)
  `);

  const insertFailure = db.prepare(`
    INSERT INTO build_failures (deployment_id, stage, error_message, root_cause, fix_applied, time_to_resolve_min)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertIncident = db.prepare(`
    INSERT INTO incidents (deployment_id, severity, downstream_services_affected, summary, resolved_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertInfra = db.prepare(`
    INSERT INTO infra_changes (resource, change_description, timestamp, linked_deployment_id)
    VALUES (?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    let deployCount = 0;
    let failureCount = 0;
    let incidentCount = 0;
    let infraCount = 0;

    for (const dep of deployments) {
      const cascade = dep._cascade;
      const bigDeploy = dep._bigDeploy;
      const isFriday = dep._isFriday;
      const playbook = dep._playbook;

      const cleanDep = { ...dep };
      delete cleanDep._cascade;
      delete cleanDep._bigDeploy;
      delete cleanDep._isFriday;
      delete cleanDep._playbook;
      cleanDep.diff = playbook?.diff || dep.diff || null;

      const result = insertDeploy.run(cleanDep);
      const depId = result.lastInsertRowid;
      deployCount++;

      /* Record Build Failure & Proven Fix */
      if (dep.status !== 'success') {
        const stage = playbook?.stage || (dep.change_type === 'dependency' ? 'build' : 'deploy');
        const errorMessage = playbook?.error_message || `Deployment failed in ${stage} stage: Container health check timeout after 6 retries`;
        const rootCause = playbook?.root_cause || `Configuration parameter mismatch in ${dep.service} production overlay`;
        const fixApplied = playbook?.fix_applied || `1) Rolled back to previous stable replica; 2) Updated Kubernetes configuration; 3) Re-deployed with validated environment secrets.`;
        const timeToResolve = playbook?.time_to_resolve_min || randInt(15, 35);

        insertFailure.run(
          depId,
          stage,
          errorMessage,
          rootCause,
          fixApplied,
          timeToResolve,
        );
        failureCount++;
      }

      /* Record Production Incident for Cascades */
      if (cascade && dep.service === 'payments') {
        const severity = 'critical';
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + 24 * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify(['checkout']),
          `Payments connection pool reduction triggered HTTP 504 timeouts across checkout-orchestrator, halting cart finalization (3,840 pending orders backed up).`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      } else if (bigDeploy && dep.status !== 'success') {
        const severity = 'high';
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + 32 * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify([]),
          `Large monolithic release (${dep.lines_changed} lines) to ${dep.service} caused memory limit exhaustion (OOMKill code 137) during route table warming.`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      } else if (isFriday && dep.status !== 'success') {
        const severity = 'high';
        const resolvedAt = new Date(new Date(dep.timestamp).getTime() + 20 * 60 * 1000);

        insertIncident.run(
          depId,
          severity,
          JSON.stringify([]),
          `Friday afternoon schema migration on ${dep.service} triggered AccessExclusiveLock contention, blocking production transactions during peak customer volume.`,
          resolvedAt.toISOString(),
        );
        incidentCount++;
      }

      /* Record Linked Infrastructure Change */
      if (dep.change_type === 'infra' || (dep.change_type === 'config' && rand() > 0.4)) {
        insertInfra.run(
          pick(INFRA_RESOURCES),
          `Production cluster configuration update for ${dep.service}: tuned connection pooling and threadpool concurrency`,
          dep.timestamp,
          depId,
        );
        infraCount++;
      }

      /* Standalone Infrastructure Maintenance */
      if (rand() > 0.88) {
        const infraTime = new Date(new Date(dep.timestamp).getTime() + randInt(-1, 1) * 24 * 60 * 60 * 1000);
        insertInfra.run(
          pick(INFRA_RESOURCES),
          `Automated RDS maintenance and automated point-in-time snapshot verification for ${dep.service}`,
          infraTime.toISOString(),
          null,
        );
        infraCount++;
      }
    }

    return { deployCount, failureCount, incidentCount, infraCount };
  });

  const counts = insertAll();

  console.log(`   ✅ Inserted ${counts.deployCount} enterprise deployment records`);
  console.log(`   ✅ Inserted ${counts.failureCount} detailed failure & proven fix playbooks`);
  console.log(`   ✅ Inserted ${counts.incidentCount} production blast radius incidents`);
  console.log(`   ✅ Inserted ${counts.infraCount} infrastructure topology changes`);

  /* Discover Historical Patterns */
  console.log('\n🧠 Running Autonomous Pattern Learner...');
  const patternCount = recomputePatterns();
  console.log(`   ✅ ${patternCount} statistically verified risk patterns discovered\n`);

  const patterns = db.prepare('SELECT * FROM learned_patterns ORDER BY risk_multiplier DESC').all();
  for (const p of patterns) {
    console.log(`   • ${p.pattern_description} (×${p.risk_multiplier}, evidence: ${p.evidence_count})`);
  }

  /* Retain into Hindsight Cloud */
  if (isHindsightAvailable()) {
    console.log('\n🧠 Purging & Retaining Production Memory Bank into Hindsight Cloud...');
    await clearBank();

    const allDeployments = db.prepare('SELECT * FROM deployments').all();
    const allFailures = db.prepare(`
      SELECT bf.*, d.service, d.version, d.timestamp, d.change_type, d.author, d.notes
      FROM build_failures bf
      JOIN deployments d ON d.id = bf.deployment_id
    `).all();
    const allIncidents = db.prepare('SELECT * FROM incidents').all();
    const deployMap = {};
    for (const d of allDeployments) deployMap[d.id] = d;

    /* Build rich memories including PROVEN GREEN FIXES */
    const memories = [
      ...allDeployments.map(d => buildDeploymentMemory(d)),
      ...allFailures.map(f => {
        let mem = buildFailureMemory(f, deployMap[f.deployment_id]);
        if (f.fix_applied) {
          mem += ` PROVEN GREEN FIX: ${f.fix_applied}. When deploying future ${f.change_type} changes to ${f.service}, execute these exact steps to pass green.`;
        }
        return mem;
      }),
      ...allIncidents.map(i => buildIncidentMemory(i, deployMap[i.deployment_id])),
      ...patterns.map(p => buildPatternMemory(p)),
    ];

    try {
      await bulkRetain(memories);
      console.log(`   ✅ ${memories.length} high-fidelity memories indexed in Hindsight Cloud`);
    } catch (err) {
      console.warn('   ⚠️ Hindsight bulk retain warning:', err.message);
    }
  } else {
    console.log('\n💡 Note: Hindsight is operating in local SQLite memory mode.');
  }

  console.log('\n🎉 Production-Grade Seed Complete! Everything is ready.\n');
}

seed().catch(err => {
  console.error('❌ Seed execution failed:', err);
  process.exit(1);
});
