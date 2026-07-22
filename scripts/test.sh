#!/usr/bin/env bash
# Test script for arize-test-eval-api
# Usage: ./scripts/test.sh [BASE_URL] [AUTH_TOKEN]
#
# Defaults to http://localhost:3000 for local vercel dev.
# Pass your deployed URL as the first arg for production testing.

set -euo pipefail

BASE="${1:-http://localhost:3000}"
TOKEN="${2:-${EVAL_AUTH_TOKEN:-}}"

# Build auth header
if [[ -n "$TOKEN" ]]; then
  AUTH=(-H "Authorization: Bearer $TOKEN")
else
  AUTH=()
fi

PASS=0
FAIL=0

check() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"

  if [[ "$actual_status" == "$expected_status" ]]; then
    echo "  PASS [$label] — HTTP $actual_status"
    PASS=$((PASS + 1))
  else
    echo "  FAIL [$label] — expected HTTP $expected_status, got $actual_status"
    echo "       body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Arize Test Eval API — test suite ==="
echo "    BASE: $BASE"
echo "    AUTH: ${TOKEN:+(set)}"
echo ""

# ── /health ──────────────────────────────────────────────────────────────────
echo "--- /health"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" "$BASE/health")
body=$(cat /tmp/eval_body.txt)
check "health" "200" "$resp" "$body"
echo "       $(echo "$body" | grep -o '"status":"[^"]*"')"
echo ""

# ── /evaluate: stub modes ─────────────────────────────────────────────────────
echo "--- /evaluate — stub modes"

EVAL_PAYLOAD() {
  local evaluator="$1"
  cat <<EOF
{
  "metadata": {
    "request_id": "test-$(date +%s)",
    "evaluator": "$evaluator",
    "record_id": "span-001"
  },
  "input": {
    "input": "Which restaurants deliver?",
    "output": "Olio e Piu offers delivery via DoorDash."
  }
}
EOF
}

for mode in stub-pass stub-fail keyword; do
  resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
    -X POST "$BASE/evaluate" \
    -H "Content-Type: application/json" \
    "${AUTH[@]}" \
    -d "$(EVAL_PAYLOAD "$mode")")
  body=$(cat /tmp/eval_body.txt)
  check "evaluate/$mode" "200" "$resp" "$body"
  echo "       $body"
done
echo ""

# ── /evaluate: keyword scoring — should fail (no delivery keyword) ────────────
echo "--- /evaluate — keyword fail (no delivery term)"
PAYLOAD_NO_DELIVERY=$(cat <<'EOF'
{
  "metadata": {
    "request_id": "test-no-delivery",
    "evaluator": "keyword",
    "record_id": "span-002"
  },
  "input": {
    "input": "What time does the store open?",
    "output": "The store opens at 9am."
  }
}
EOF
)
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$PAYLOAD_NO_DELIVERY")
body=$(cat /tmp/eval_body.txt)
check "evaluate/keyword-fail" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /evaluate: no-verdict path ───────────────────────────────────────────────
echo "--- /evaluate — no-verdict (Arize failure path)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$(EVAL_PAYLOAD "no-verdict")")
body=$(cat /tmp/eval_body.txt)
check "evaluate/no-verdict" "200" "$resp" "$body"
echo "       $body (should be empty object {})"
echo ""

# ── /evaluate: force status-code paths ───────────────────────────────────────
echo "--- /evaluate — forced status codes"
for mode_status in "force-401:401" "force-403:403" "force-429:429" "force-500:500" "force-400:400"; do
  mode="${mode_status%%:*}"
  expected="${mode_status##*:}"
  resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
    -X POST "$BASE/evaluate" \
    -H "Content-Type: application/json" \
    -H "x-test-mode: $mode" \
    "${AUTH[@]}" \
    -d "$(EVAL_PAYLOAD "any-evaluator")")
  body=$(cat /tmp/eval_body.txt)
  check "evaluate/$mode" "$expected" "$resp" "$body"
done
echo ""

# ── /evaluate: slow mode via query param ─────────────────────────────────────
echo "--- /evaluate — slow-500 via ?mode= query param"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate?mode=slow-500" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$(EVAL_PAYLOAD "any-evaluator")")
body=$(cat /tmp/eval_body.txt)
check "evaluate/slow-500" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /evaluate: auth check (only if token set) ─────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  echo "--- /evaluate — bad auth (should 401)"
  resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
    -X POST "$BASE/evaluate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer wrong-token" \
    -d "$(EVAL_PAYLOAD "stub-pass")")
  body=$(cat /tmp/eval_body.txt)
  check "evaluate/bad-auth" "401" "$resp" "$body"
  echo ""
fi

# ── /tool/score ───────────────────────────────────────────────────────────────
echo "--- /tool/score"
TOOL_PAYLOAD=$(cat <<'EOF'
{
  "record_id": "span-001",
  "criteria": "helpfulness",
  "text": "You can order delivery through DoorDash or Uber Eats. The restaurant usually delivers in 30-45 minutes."
}
EOF
)
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$TOOL_PAYLOAD")
body=$(cat /tmp/eval_body.txt)
check "tool/score" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /tool/score: missing text ─────────────────────────────────────────────────
echo "--- /tool/score — missing text (should 400)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{"criteria":"relevance"}')
body=$(cat /tmp/eval_body.txt)
check "tool/score/missing-text" "400" "$resp" "$body"
echo ""

# ── /requests debug buffer ───────────────────────────────────────────────────
echo "--- /requests — debug buffer"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  "$BASE/requests")
body=$(cat /tmp/eval_body.txt)
check "requests/GET" "200" "$resp" "$body"
count=$(echo "$body" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "?")
echo "       captured $count request(s)"
echo ""

# ── summary ───────────────────────────────────────────────────────────────────
echo "=== Results: $PASS passed, $FAIL failed ==="
if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
