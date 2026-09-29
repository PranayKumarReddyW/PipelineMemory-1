#!/usr/bin/env bash
# ==============================================================================
# PipelineMemory CI/CD Verification Test Suite
#
# Tests the GitHub Actions Risk Gate pipeline via:
#   1. Act (Dockerized GitHub Actions runner)
#   2. Direct CI pipeline simulation against live PipelineMemory engine
# ==============================================================================

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_URL="${PIPELINE_MEMORY_URL:-http://localhost:3001}"
MIGRATION_FILE="$REPO_DIR/services/payments/migrations/20260901_create_transactions.sql"

echo "=================================================================="
echo "🚀 PIPELINEMEMORY CI/CD TESTING SUITE"
echo "=================================================================="
echo "Project Root:     $REPO_DIR"
echo "Pipeline Server:  $SERVER_URL"
echo "Checking PipelineMemory server connection..."

if ! curl -s --max-time 3 "$SERVER_URL/api/stats" > /dev/null 2>&1; then
  echo "❌ Error: PipelineMemory backend not reachable at $SERVER_URL."
  echo "   Make sure the backend is running: npm run dev or (cd backend && npm run dev)"
  exit 1
fi

echo "✅ PipelineMemory server is healthy."

# ------------------------------------------------------------------------------
# TEST CASE 1: High-Risk Unindexed DB Migration (Should be BLOCKED)
# ------------------------------------------------------------------------------
echo ""
echo "------------------------------------------------------------------"
echo "🧪 TEST CASE 1: High-Risk Database Migration PR"
echo "------------------------------------------------------------------"
echo "Proposed Migration:"
cat "$MIGRATION_FILE" | sed 's/^/  + /'

PAYLOAD_FILE="$REPO_DIR/.pipeline-memory/test_case_1.json"
DIFF_FILE="$REPO_DIR/.pipeline-memory/test_case_1.diff"
mkdir -p "$REPO_DIR/.pipeline-memory"

# Generate genuine Git unified diff
cat << 'EOF' > "$DIFF_FILE"
diff --git a/migrations/20261001_add_partition.sql b/migrations/20261001_add_partition.sql
new file mode 100644
index 0000000..8b8474a
--- /dev/null
+++ b/migrations/20261001_add_partition.sql
@@ -0,0 +1,4 @@
+-- Unindexed ALTER TABLE migration on high-volume active table
+ALTER TABLE transactions ADD COLUMN merchant_region VARCHAR(64) NOT NULL;
+ALTER TABLE transactions ADD PARTITION (PARTITION p_2026_q4 VALUES LESS THAN ('2026-11-01'));
+SELECT * FROM transactions WHERE status = 'pending';
EOF
echo "Generated Native Git Diff ($DIFF_FILE):"
cat "$DIFF_FILE"

node -e '
  const fs = require("fs");
  const diff = fs.readFileSync(process.argv[2], "utf8");

  fs.writeFileSync(process.argv[1], JSON.stringify({
    service: "payments",
    change_type: "db_migration",
    author: "pranay",
    diff: diff,
    files_changed: 1,
    lines_changed: diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).length
  }, null, 2));
' "$PAYLOAD_FILE" "$DIFF_FILE"

RESP_FILE_1="$REPO_DIR/.pipeline-memory/resp_1.json"
curl -s -X POST "$SERVER_URL/api/predict" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD_FILE" > "$RESP_FILE_1"

node -e '
  const fs = require("fs");
  const r = JSON.parse(fs.readFileSync("'"$RESP_FILE_1"'", "utf8"));
  console.log(`Risk Score:    ${r.risk_score} / 100 (${r.risk_level.toUpperCase()})`);
  console.log(`Diff Hazards:  ${r.diff_analysis?.findings?.length || 0} anti-patterns flagged`);
  (r.diff_analysis?.findings || []).forEach(f => console.log(`  ❌ [${f.severity.toUpperCase()}] ${f.rule} in ${f.file}`));
  console.log(`Gate Verdict:  ${r.risk_score >= 50 ? "BLOCKED ⛔" : "APPROVED ✅"}`);
  if (r.risk_score < 50) {
    console.error("Test failed: High-risk DB migration should have been blocked!");
    process.exit(1);
  }
'

echo "✅ Test Case 1 Passed: Dangerous DB migration correctly blocked."

# ------------------------------------------------------------------------------
# TEST CASE 2: Safe Unit Test Patch (Should be APPROVED)
# ------------------------------------------------------------------------------
echo ""
echo "------------------------------------------------------------------"
echo "🧪 TEST CASE 2: Safe Code Micro-Patch PR"
echo "------------------------------------------------------------------"

PAYLOAD_FILE_2="$REPO_DIR/.pipeline-memory/test_case_2.json"
node -e '
  const fs = require("fs");
  const diff = `diff --git a/src/payments.test.js b/src/payments.test.js
--- a/src/payments.test.js
+++ b/src/payments.test.js
@@ -10,3 +10,5 @@
+test("validates payment amount > 0", () => {
+  expect(() => processPayment({ amount: -5 })).toThrow();
+});`;

  fs.writeFileSync(process.argv[1], JSON.stringify({
    service: "auth",
    change_type: "code",
    author: "sarah.chen",
    diff: diff,
    files_changed: 1,
    lines_changed: 4
  }, null, 2));
' "$PAYLOAD_FILE_2"

RESP_FILE_2="$REPO_DIR/.pipeline-memory/resp_2.json"
curl -s -X POST "$SERVER_URL/api/predict" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD_FILE_2" > "$RESP_FILE_2"

node -e '
  const fs = require("fs");
  const r = JSON.parse(fs.readFileSync("'"$RESP_FILE_2"'", "utf8"));
  console.log(`Risk Score:    ${r.risk_score} / 100 (${r.risk_level.toUpperCase()})`);
  console.log(`Diff Hazards:  ${r.diff_analysis?.findings?.length || 0} anti-patterns flagged`);
  console.log(`Gate Verdict:  ${r.risk_score < 50 ? "APPROVED ✅" : "BLOCKED ⛔"}`);
  if (r.risk_score >= 50) {
    console.error("Test failed: Safe test patch should have been approved!");
    process.exit(1);
  }
'

echo "✅ Test Case 2 Passed: Safe micro-patch correctly approved."

# ------------------------------------------------------------------------------
# TEST CASE 3: Running with Act (Local GitHub Actions Runner)
# ------------------------------------------------------------------------------
echo ""
echo "------------------------------------------------------------------"
echo "🐳 TEST CASE 3: Running Pipeline via act (GitHub Actions in Docker)"
echo "------------------------------------------------------------------"

if which act > /dev/null 2>&1; then
  echo "Invoking act on pull_request event..."
  cd "$REPO_DIR"
  act pull_request \
    --container-architecture linux/amd64 \
    --network host \
    --env PIPELINE_MEMORY_URL="http://host.docker.internal:3001" \
    --workflows .github/workflows/pipeline-risk-gate.yml
  echo "✅ Act execution completed successfully!"
else
  echo "⚠️ act CLI not found in PATH, skipping containerized run."
fi

echo ""
echo "=================================================================="
echo "🎉 ALL PIPELINE RISK GATE TESTS COMPLETED SUCCESSFULLY"
echo "=================================================================="
