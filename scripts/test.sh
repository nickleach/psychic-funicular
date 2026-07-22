#!/usr/bin/env bash
# Test script for the Star Wars Chatbot Eval API
# Usage: ./scripts/test.sh [BASE_URL] [AUTH_TOKEN]
#
# Defaults to http://localhost:3000 for local vercel dev.
# Pass your deployed URL as the first arg for production testing.

set -euo pipefail

BASE="${1:-http://localhost:3000}"
TOKEN="${2:-${EVAL_AUTH_TOKEN:-}}"

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

EVAL_PAYLOAD() {
  local evaluator="$1"
  local question="${2:-Who trained Anakin Skywalker?}"
  local answer="${3:-Obi-Wan Kenobi was Anakin Skywalker's Jedi Master.}"
  cat <<EOF
{
  "metadata": {
    "request_id": "test-$(date +%s)",
    "evaluator": "$evaluator",
    "record_id": "span-sw-001"
  },
  "input": {
    "input":  "$question",
    "output": "$answer"
  }
}
EOF
}

echo ""
echo "=== Star Wars Chatbot Eval API — test suite ==="
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
for mode in stub-pass stub-fail; do
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

# ── /evaluate: keyword — pass (answer mentions "Jedi") ───────────────────────
echo "--- /evaluate — keyword (should pass — contains Jedi lore)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$(EVAL_PAYLOAD "keyword" "Who is Luke Skywalker?" "Luke is a Jedi Knight who destroyed the Death Star.")")
body=$(cat /tmp/eval_body.txt)
check "evaluate/keyword-pass" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /evaluate: keyword — fail (answer has no Star Wars terms) ────────────────
echo "--- /evaluate — keyword (should fail — no lore terms)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$(EVAL_PAYLOAD "keyword" "What is the capital of France?" "Paris.")")
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

# ── /evaluate: criteria via query param (llm mode skipped without key) ───────
echo "--- /evaluate — slow-300 (via ?mode= query param)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/evaluate?mode=slow-300" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d "$(EVAL_PAYLOAD "any-evaluator")")
body=$(cat /tmp/eval_body.txt)
check "evaluate/slow-300" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /evaluate: bad auth ───────────────────────────────────────────────────────
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

# ── /tool/score — lore_accuracy ──────────────────────────────────────────────
echo "--- /tool/score — lore_accuracy (should pass)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{
    "record_id": "span-sw-001",
    "criteria": "lore_accuracy",
    "text": "Qui-Gon Jinn discovered midi-chlorians and was Obi-Wan Kenobi'\''s master before his death on Naboo."
  }')
body=$(cat /tmp/eval_body.txt)
check "tool/score/lore_accuracy" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /tool/score — hallucination ──────────────────────────────────────────────
echo "--- /tool/score — hallucination (should pass — no fabrications)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{
    "record_id": "span-sw-002",
    "criteria": "hallucination",
    "text": "Darth Vader is the Sith Lord formerly known as Anakin Skywalker, apprentice to Emperor Palpatine."
  }')
body=$(cat /tmp/eval_body.txt)
check "tool/score/hallucination" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /tool/score — in_character ───────────────────────────────────────────────
echo "--- /tool/score — in_character (should fail — breaks character)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{
    "record_id": "span-sw-003",
    "criteria": "in_character",
    "text": "As an AI language model I cannot provide information about Star Wars characters."
  }')
body=$(cat /tmp/eval_body.txt)
check "tool/score/in_character-fail" "200" "$resp" "$body"
echo "       $body"
echo ""

# ── /tool/score — missing text ───────────────────────────────────────────────
echo "--- /tool/score — missing text (should 400)"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  -X POST "$BASE/tool/score" \
  -H "Content-Type: application/json" \
  "${AUTH[@]}" \
  -d '{"criteria":"relevance"}')
body=$(cat /tmp/eval_body.txt)
check "tool/score/missing-text" "400" "$resp" "$body"
echo ""

# ── /requests ─────────────────────────────────────────────────────────────────
echo "--- /requests — debug buffer"
resp=$(curl -s -o /tmp/eval_body.txt -w "%{http_code}" \
  "${AUTH[@]}" \
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
