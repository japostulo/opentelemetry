#!/usr/bin/env bash
# E2E SigNoz validator for the @haocruz/opentelemetry refresh.
#
# Drives the playground (Node apps) against SigNoz, then queries ClickHouse
# directly to validate that the new HaocProfile (sampling, ignore_routes,
# distributed propagation) actually behaves as specified end-to-end.
#
# Prereqs (must all be running):
#   * /home/japostulo/projects/signoz             docker compose up -d
#   * /home/japostulo/projects/totem/haoc-opentelemetry/playground
#                                                 docker compose up -d
#
# Exit code is the number of failed assertions (0 = success).

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────────
EXPRESS_URL="${EXPRESS_URL:-http://localhost:3020}"
NEST_URL="${NEST_URL:-http://localhost:3010}"
CLICKHOUSE_CTR="${CLICKHOUSE_CTR:-signoz-clickhouse}"
SAMPLE_REQUESTS="${SAMPLE_REQUESTS:-100}"
# Production NODE_ENV + minimal profile → ratio = 0.2 → expected ≈ 20 of 100.
EXPECTED_SAMPLE_RATIO="0.2"
SAMPLE_TOLERANCE="${SAMPLE_TOLERANCE:-12}" # ±12 around the expected mean

FAILED=0
PASSED=0

# ── Helpers ───────────────────────────────────────────────────────────
ck() {
  docker exec -i "$CLICKHOUSE_CTR" clickhouse-client --query "$1" 2>/dev/null
}

window_clause() {
  # $1 = ISO timestamp (UTC) marking the start of the test window
  echo "timestamp >= toDateTime64('$1', 9, 'UTC')"
}

iso_now() {
  date -u +"%Y-%m-%d %H:%M:%S"
}

assert() {
  local label="$1" actual="$2" cond="$3" expected="$4"
  local ok=0
  case "$cond" in
    eq)  [ "$actual" = "$expected" ] && ok=1 ;;
    ge)  [ "$actual" -ge "$expected" ] && ok=1 ;;
    le)  [ "$actual" -le "$expected" ] && ok=1 ;;
    in)  # expected is "<lo>:<hi>"
         local lo="${expected%:*}" hi="${expected#*:}"
         [ "$actual" -ge "$lo" ] && [ "$actual" -le "$hi" ] && ok=1 ;;
  esac
  if [ "$ok" = 1 ]; then
    echo "  ✔ $label  (got $actual, $cond $expected)"
    PASSED=$((PASSED+1))
  else
    echo "  ✘ $label  (got $actual, expected $cond $expected)"
    FAILED=$((FAILED+1))
  fi
}

wait_flush() {
  # Default OTel batch span processor delay is 5s; give it a margin.
  sleep "${1:-12}"
}

require_running() {
  local url="$1" label="$2"
  if ! curl -fsS -o /dev/null -m 3 "$url"; then
    echo "✘ $label not reachable at $url" >&2
    exit 99
  fi
}

# ── Pre-flight ────────────────────────────────────────────────────────
echo "▶ Pre-flight"
require_running "$EXPRESS_URL/hello" "playground-express"
require_running "$NEST_URL/hello" "playground-nestjs"
if ! docker exec "$CLICKHOUSE_CTR" clickhouse-client --query 'SELECT 1' >/dev/null 2>&1; then
  echo "✘ ClickHouse container '$CLICKHOUSE_CTR' not reachable" >&2
  exit 99
fi
echo "  ✔ Express, Nest, ClickHouse are up"

# ─────────────────────────────────────────────────────────────────────
# 1) Sampling (NODE_ENV=production + profile=minimal → ratio ≈ 0.2)
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 1 — sampling ratio for minimal profile in production"
T0="$(iso_now)"
for _ in $(seq 1 "$SAMPLE_REQUESTS"); do
  curl -s -o /dev/null "$EXPRESS_URL/hello" || true
done
wait_flush

EXPRESS_HELLO_COUNT=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` = 'playground-express'
    AND name = 'GET /hello'
")
EXPECTED=$(awk -v n="$SAMPLE_REQUESTS" -v r="$EXPECTED_SAMPLE_RATIO" 'BEGIN{ printf "%d", n*r }')
LO=$((EXPECTED - SAMPLE_TOLERANCE))
HI=$((EXPECTED + SAMPLE_TOLERANCE))
[ "$LO" -lt 0 ] && LO=0
assert "express /hello root spans (${SAMPLE_REQUESTS}× → ~$EXPECTED, ±$SAMPLE_TOLERANCE)" \
  "${EXPRESS_HELLO_COUNT:-0}" in "${LO}:${HI}"

# ─────────────────────────────────────────────────────────────────────
# 2) Sampling on NestJS — same ratio expected.
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 2 — sampling ratio carries to NestJS"
T0="$(iso_now)"
for _ in $(seq 1 "$SAMPLE_REQUESTS"); do
  curl -s -o /dev/null "$NEST_URL/hello" || true
done
wait_flush

NEST_HELLO_COUNT=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` = 'playground-nestjs'
    AND name = 'GET /hello'
")
assert "nest /hello root spans (${SAMPLE_REQUESTS}× → ~$EXPECTED, ±$SAMPLE_TOLERANCE)" \
  "${NEST_HELLO_COUNT:-0}" in "${LO}:${HI}"

# ─────────────────────────────────────────────────────────────────────
# 3) ignore_routes — /favicon.ico must NEVER be exported (drop pre-export).
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 3 — ignore_routes (/favicon.ico) is filtered before export"
T0="$(iso_now)"
for _ in $(seq 1 30); do
  curl -s -o /dev/null "$EXPRESS_URL/favicon.ico" || true
  curl -s -o /dev/null "$NEST_URL/favicon.ico"    || true
done
wait_flush

FAVICON_COUNT=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` LIKE 'playground-%'
    AND (name ILIKE '%favicon%' OR http_url ILIKE '%favicon%')
")
assert "no /favicon.ico spans exported" "${FAVICON_COUNT:-0}" eq 0

# ─────────────────────────────────────────────────────────────────────
# 4) POST /echo — body capture is OFF in minimal, secrets must NOT leak.
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 4 — minimal profile does not capture request bodies"
T0="$(iso_now)"
SECRET_TOKEN="haoc-secret-$(date +%s)"
for _ in $(seq 1 20); do
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"alice\",\"password\":\"$SECRET_TOKEN\"}" \
    "$EXPRESS_URL/echo" || true
done
wait_flush

LEAK_COUNT=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` = 'playground-express'
    AND (
      arrayExists(v -> position(v, '$SECRET_TOKEN') > 0, mapValues(attributes_string))
      OR position(events, '$SECRET_TOKEN') > 0
    )
")
assert "no body/payload contains '$SECRET_TOKEN'" "${LEAK_COUNT:-0}" eq 0

# Sampling-aware: at least *some* /echo root spans should exist (≥ 1)
ECHO_SPANS=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` = 'playground-express'
    AND name = 'POST /echo'
")
assert "POST /echo produced at least one root span" "${ECHO_SPANS:-0}" ge 1

# ─────────────────────────────────────────────────────────────────────
# 5) Distributed propagation — express → nest /hello via traceparent.
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 5 — distributed trace propagation (manual traceparent)"
TRACE_ID="$(head -c16 /dev/urandom | xxd -p)" # 32 hex chars
SPAN_ID="$(head -c8  /dev/urandom | xxd -p)"  # 16 hex chars
TRACEPARENT="00-${TRACE_ID}-${SPAN_ID}-01"    # sampled flag forced ON
T0="$(iso_now)"
curl -s -o /dev/null -H "traceparent: $TRACEPARENT" "$EXPRESS_URL/hello" || true
curl -s -o /dev/null -H "traceparent: $TRACEPARENT" "$NEST_URL/hello"    || true
wait_flush

DISTRIBUTED_SVCS=$(ck "
  SELECT count(DISTINCT \`resource_string_service\$\$name\`)
  FROM signoz_traces.signoz_index_v3
  WHERE trace_id = '$TRACE_ID'
")
assert "trace $TRACE_ID spans 2 services" "${DISTRIBUTED_SVCS:-0}" ge 2

# ─────────────────────────────────────────────────────────────────────
# 6) Service identity attributes (app.platform, environment).
# ─────────────────────────────────────────────────────────────────────
echo
echo "▶ Test 6 — service identity / environment attributes are stamped"
T0="$(iso_now)"
curl -s -o /dev/null -H "traceparent: 00-$(head -c16 /dev/urandom | xxd -p)-$(head -c8 /dev/urandom | xxd -p)-01" \
  "$EXPRESS_URL/hello" || true
wait_flush

ENV_TAGGED=$(ck "
  SELECT count()
  FROM signoz_traces.signoz_index_v3
  WHERE $(window_clause "$T0")
    AND \`resource_string_service\$\$name\` = 'playground-express'
    AND resources_string['deployment.environment'] = 'playground'
")
assert "express spans carry deployment.environment=playground" "${ENV_TAGGED:-0}" ge 1

# ─────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────"
echo " Passed: $PASSED   Failed: $FAILED"
echo "──────────────────────────────────────────────"
exit "$FAILED"
