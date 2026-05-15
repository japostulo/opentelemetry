#!/usr/bin/env bash
# =============================================================================
# validate-trace-propagation.sh
#
# Validates W3C distributed trace propagation across the playground stack:
#   - Frontend (web-app)  → NestJS, Express, Laravel
#   - NestJS              → Express, Laravel (backend-to-backend)
#   - traceparent manual  → all backends
#   - Direct curl         → all backends (no propagation, new trace)
#   - CORS                → traceparent/tracestate/baggage allowed
#
# Usage:
#   ./scripts/validate-trace-propagation.sh [--no-wait] [--timeout <seconds>]
#
# Requires:
#   - Docker with signoz-clickhouse container running
#   - Playground services running (nestjs-app, express-app, laravel-app)
#
# Exit codes:
#   0  — all scenarios PASS
#   1  — one or more scenarios FAIL
# =============================================================================
set -uo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
NESTJS_BASE="${NESTJS_BASE:-http://localhost:3010}"
EXPRESS_BASE="${EXPRESS_BASE:-http://localhost:3020}"
LARAVEL_BASE="${LARAVEL_BASE:-http://localhost:8085}"
CH_CONTAINER="${CH_CONTAINER:-signoz-clickhouse}"
FLUSH_WAIT="${FLUSH_WAIT:-6}"    # seconds to wait for spans to be exported
SKIP_WAIT="${SKIP_WAIT:-0}"
TS="$(date +%s)"

# ── Counters ──────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# ── Color helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log_header() { echo -e "\n${BOLD}${BLUE}══ $1 ══${RESET}"; }
log_case()   { echo -e "\n${BOLD}Caso $1: $2${RESET}"; }
log_pass()   { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}[PASS]${RESET} $1"; }
log_fail()   { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}[FAIL]${RESET} $1"; }
log_skip()   { SKIP=$((SKIP+1)); echo -e "  ${YELLOW}[SKIP]${RESET} $1"; }
log_info()   { echo -e "  ${YELLOW}[INFO]${RESET} $1"; }

# ── ClickHouse helper ─────────────────────────────────────────────────────────
ch() {
  docker exec "$CH_CONTAINER" clickhouse-client --query "$1" 2>/dev/null
}

# ── Wait for a service to respond ─────────────────────────────────────────────
wait_for_service() {
  local name="$1" url="$2"
  local retries=20 delay=2
  for i in $(seq 1 $retries); do
    if curl -sf --max-time 3 "$url" > /dev/null 2>&1; then
      log_info "$name is ready"
      return 0
    fi
    echo -n "."
    sleep "$delay"
  done
  log_fail "$name not ready at $url after ${retries}×${delay}s"
  return 1
}

# ── Flush: wait for spans to be exported ─────────────────────────────────────
flush() {
  [[ "$SKIP_WAIT" == "1" ]] && return 0
  sleep "$FLUSH_WAIT"
}

# ── Query spans for a specific test run ID ────────────────────────────────────
# Returns: "trace_id|service1,service2,..." lines grouped by trace_id
query_by_test_run_id() {
  local run_id="$1"
  ch "
SELECT
  trace_id,
  groupUniqArray(resources_string['service.name']) AS services,
  count() AS span_count
FROM signoz_traces.signoz_index_v3
WHERE attributes_string['test.run_id'] = '${run_id}'
GROUP BY trace_id
ORDER BY span_count DESC
FORMAT TabSeparated
"
}

# ── Query spans for a specific trace_id ───────────────────────────────────────
query_by_trace_id() {
  local trace_id="$1"
  ch "
SELECT
  trace_id,
  resources_string['service.name'] AS service,
  name AS span_name
FROM signoz_traces.signoz_index_v3
WHERE trace_id = '${trace_id}'
ORDER BY timestamp
FORMAT TabSeparated
"
}

# ── Assert: exactly 1 trace with services matching criteria ──────────────────
# $1 = test label
# $2 = run_id
# $3... = required service names (must ALL appear in the trace)
assert_single_trace_with_services() {
  local label="$1" run_id="$2"
  shift 2
  local required_services=("$@")

  local rows
  rows=$(query_by_test_run_id "$run_id")

  if [[ -z "$rows" ]]; then
    log_fail "$label — nenhum span encontrado para run_id=$run_id (spans não chegaram ao ClickHouse)"
    return 1
  fi

  local trace_count
  trace_count=$(echo "$rows" | wc -l | tr -d ' ')

  if [[ "$trace_count" -gt 1 ]]; then
    log_fail "$label — encontrados ${trace_count} trace_ids distintos (esperado: 1)"
    echo "$rows" | while IFS=$'\t' read -r tid svcs cnt; do
      log_info "  trace_id=${tid} services=${svcs} spans=${cnt}"
    done
    return 1
  fi

  local trace_id
  trace_id=$(echo "$rows" | awk -F'\t' 'NR==1{print $1}')
  local services_found
  services_found=$(echo "$rows" | awk -F'\t' 'NR==1{print $2}')

  local missing=()
  for svc in "${required_services[@]}"; do
    if ! echo "$services_found" | grep -q "$svc"; then
      missing+=("$svc")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_fail "$label — trace_id=${trace_id} encontrado mas faltam services: ${missing[*]}"
    log_info "  services encontrados: $services_found"
    return 1
  fi

  log_pass "$label"
  log_info "  trace_id: ${trace_id}"
  log_info "  services: ${services_found}"
  return 0
}

# ── Assert: trace_id is preserved in backend span ─────────────────────────────
assert_trace_id_preserved() {
  local label="$1" expected_trace_id="$2" service="$3"

  local found
  found=$(ch "
SELECT count()
FROM signoz_traces.signoz_index_v3
WHERE trace_id = '${expected_trace_id}'
  AND resources_string['service.name'] = '${service}'
FORMAT TabSeparated
")

  if [[ "${found:-0}" -gt 0 ]]; then
    log_pass "$label (trace_id preservado: ${expected_trace_id})"
  else
    log_fail "$label — service ${service} não registrou span com trace_id=${expected_trace_id}"
  fi
}

# ── Assert: CORS allows trace headers ─────────────────────────────────────────
assert_cors_allows_trace_headers() {
  local label="$1" url="$2" origin="${3:-http://localhost:8090}"

  local resp
  resp=$(curl -s -i -X OPTIONS "$url" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: traceparent,tracestate,baggage,x-test-run-id" \
    2>/dev/null)

  local allowed_headers
  allowed_headers=$(echo "$resp" | grep -i "^access-control-allow-headers" | tr '[:upper:]' '[:lower:]' | tr -d '\r')

  local missing_headers=()
  for hdr in traceparent tracestate baggage; do
    if ! echo "$allowed_headers" | grep -q "$hdr"; then
      missing_headers+=("$hdr")
    fi
  done

  local status_code
  status_code=$(echo "$resp" | head -1 | awk '{print $2}')

  if [[ ${#missing_headers[@]} -eq 0 && ("$status_code" == "200" || "$status_code" == "204") ]]; then
    log_pass "$label (status=$status_code, headers=$allowed_headers)"
  else
    log_fail "$label — status=$status_code, missing headers: ${missing_headers[*]:-none}"
    log_info "  response: $allowed_headers"
  fi
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     validate-trace-propagation.sh — haoc-opentelemetry       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo "Timestamp : $TS"
echo "Flush wait: ${FLUSH_WAIT}s"
echo ""

# ── 0. Pre-flight: services must be up ────────────────────────────────────────
log_header "0. Verificando serviços"

SERVICES_OK=1
wait_for_service "NestJS"  "$NESTJS_BASE/hello"  || SERVICES_OK=0
wait_for_service "Express" "$EXPRESS_BASE/hello" || SERVICES_OK=0
wait_for_service "Laravel" "$LARAVEL_BASE/api/hello" || SERVICES_OK=0

if [[ "$SERVICES_OK" == "0" ]]; then
  echo -e "\n${RED}Serviços não estão prontos. Suba o playground antes de executar este script.${RESET}"
  echo "  cd playground && docker compose up -d"
  exit 1
fi

# Check ClickHouse is accessible
if ! ch "SELECT 1" > /dev/null 2>&1; then
  echo -e "\n${RED}ClickHouse não está acessível. Container: $CH_CONTAINER${RESET}"
  exit 1
fi
log_info "ClickHouse acessível"

# ── CORS validation ───────────────────────────────────────────────────────────
log_header "CORS — Headers de propagação W3C"

assert_cors_allows_trace_headers "NestJS CORS"  "$NESTJS_BASE/hello"
assert_cors_allows_trace_headers "Express CORS" "$EXPRESS_BASE/hello"
assert_cors_allows_trace_headers "Laravel CORS" "$LARAVEL_BASE/api/hello"

# ── Case D — curl direto (sem traceparent) ────────────────────────────────────
log_header "Caso D — curl direto (sem traceparent)"

RUN_D_NESTJS="direct-nestjs-${TS}"
RUN_D_EXPRESS="direct-express-${TS}"
RUN_D_LARAVEL="direct-laravel-${TS}"

curl -sf "$NESTJS_BASE/hello"         -H "x-test-run-id: $RUN_D_NESTJS" > /dev/null
curl -sf "$EXPRESS_BASE/hello"        -H "x-test-run-id: $RUN_D_EXPRESS" > /dev/null
curl -sf "$LARAVEL_BASE/api/hello"    -H "x-test-run-id: $RUN_D_LARAVEL" > /dev/null

flush

log_case "D1" "curl → NestJS /hello (trace novo criado pelo backend)"
assert_single_trace_with_services "curl → NestJS" "$RUN_D_NESTJS" "playground-nestjs"

log_case "D2" "curl → Express /hello (trace novo criado pelo backend)"
assert_single_trace_with_services "curl → Express" "$RUN_D_EXPRESS" "playground-express"

log_case "D3" "curl → Laravel /api/hello (trace novo criado pelo backend)"
assert_single_trace_with_services "curl → Laravel" "$RUN_D_LARAVEL" "playground-laravel"

# ── Case E — traceparent manual ───────────────────────────────────────────────
log_header "Caso E — traceparent manual (trace_id deve ser preservado)"

TRACE_E_NESTJS="e1111111111111111111111111111111"
TRACE_E_EXPRESS="e2222222222222222222222222222222"
TRACE_E_LARAVEL="e3333333333333333333333333333333"
RUN_E_NESTJS="manual-nestjs-${TS}"
RUN_E_EXPRESS="manual-express-${TS}"
RUN_E_LARAVEL="manual-laravel-${TS}"

curl -sf "$NESTJS_BASE/hello" \
  -H "traceparent: 00-${TRACE_E_NESTJS}-aaaaaaaaaaaaaaaa-01" \
  -H "x-test-run-id: $RUN_E_NESTJS" > /dev/null

curl -sf "$EXPRESS_BASE/hello" \
  -H "traceparent: 00-${TRACE_E_EXPRESS}-bbbbbbbbbbbbbbbb-01" \
  -H "x-test-run-id: $RUN_E_EXPRESS" > /dev/null

curl -sf "$LARAVEL_BASE/api/hello" \
  -H "traceparent: 00-${TRACE_E_LARAVEL}-cccccccccccccccc-01" \
  -H "x-test-run-id: $RUN_E_LARAVEL" > /dev/null

flush

log_case "E1" "traceparent manual → NestJS"
assert_trace_id_preserved "NestJS preserva trace_id do traceparent" "$TRACE_E_NESTJS" "playground-nestjs"

log_case "E2" "traceparent manual → Express"
assert_trace_id_preserved "Express preserva trace_id do traceparent" "$TRACE_E_EXPRESS" "playground-express"

log_case "E3" "traceparent manual → Laravel"
assert_trace_id_preserved "Laravel preserva trace_id do traceparent" "$TRACE_E_LARAVEL" "playground-laravel"

# ── Case F — NestJS → Express (via proxy endpoint) ───────────────────────────
log_header "Caso F — NestJS → Express (backend-to-backend)"

RUN_F="nestjs-to-express-${TS}"
curl -sf "$NESTJS_BASE/proxy/express" \
  -H "x-test-run-id: $RUN_F" > /dev/null

flush

log_case "F" "curl → NestJS /proxy/express → Express /hello"
assert_single_trace_with_services "NestJS → Express 1 trace" "$RUN_F" "playground-nestjs" "playground-express"

# ── Case G — NestJS → Laravel (via proxy endpoint) ───────────────────────────
log_header "Caso G — NestJS → Laravel (backend-to-backend)"

RUN_G="nestjs-to-laravel-${TS}"
curl -sf "$NESTJS_BASE/proxy/laravel" \
  -H "x-test-run-id: $RUN_G" > /dev/null

flush

log_case "G" "curl → NestJS /proxy/laravel → Laravel /api/hello"
assert_single_trace_with_services "NestJS → Laravel 1 trace" "$RUN_G" "playground-nestjs" "playground-laravel"

# ── Case F2 — Express → Laravel ───────────────────────────────────────────────
log_header "Caso F2 — Express → Laravel (backend-to-backend)"

RUN_F2="express-to-laravel-${TS}"
curl -sf "$EXPRESS_BASE/proxy/laravel" \
  -H "x-test-run-id: $RUN_F2" > /dev/null

flush

log_case "F2" "curl → Express /proxy/laravel → Laravel /api/hello"
assert_single_trace_with_services "Express → Laravel 1 trace" "$RUN_F2" "playground-express" "playground-laravel"

# ── Case H — Full chain (4 services including web simulation) ─────────────────
log_header "Caso H — NestJS → Express → Laravel (cadeia completa sem web)"

RUN_H="full-chain-${TS}"
curl -sf "$NESTJS_BASE/chain" \
  -H "x-test-run-id: $RUN_H" > /dev/null

flush

log_case "H" "curl → NestJS /chain → Express /chain → Laravel /api/hello"
assert_single_trace_with_services "Cadeia completa 1 trace" "$RUN_H" \
  "playground-nestjs" "playground-express" "playground-laravel"

# ── Case E_CHAIN — traceparent manual na cadeia completa ─────────────────────
log_header "Caso E (chain) — traceparent manual propagado pela cadeia"

TRACE_CHAIN="f000000000000000f000000000000000"
RUN_CHAIN="manual-chain-${TS}"

curl -sf "$NESTJS_BASE/chain" \
  -H "traceparent: 00-${TRACE_CHAIN}-0000000000000001-01" \
  -H "x-test-run-id: $RUN_CHAIN" > /dev/null

flush

log_case "E_CHAIN" "traceparent manual → NestJS /chain (cadeia)"

# Check that all services in the chain use the same trace_id
NESTJS_SPANS=$(ch "
SELECT count() FROM signoz_traces.signoz_index_v3
WHERE trace_id = '${TRACE_CHAIN}'
  AND resources_string['service.name'] = 'playground-nestjs'
FORMAT TabSeparated
")
EXPRESS_SPANS=$(ch "
SELECT count() FROM signoz_traces.signoz_index_v3
WHERE trace_id = '${TRACE_CHAIN}'
  AND resources_string['service.name'] = 'playground-express'
FORMAT TabSeparated
")
LARAVEL_SPANS=$(ch "
SELECT count() FROM signoz_traces.signoz_index_v3
WHERE trace_id = '${TRACE_CHAIN}'
  AND resources_string['service.name'] = 'playground-laravel'
FORMAT TabSeparated
")

TOTAL_CHAIN_SPANS=$(( ${NESTJS_SPANS:-0} + ${EXPRESS_SPANS:-0} + ${LARAVEL_SPANS:-0} ))
if [[ "$TOTAL_CHAIN_SPANS" -ge 3 ]]; then
  log_pass "traceparent manual preservado pela cadeia (nestjs=${NESTJS_SPANS:-0} express=${EXPRESS_SPANS:-0} laravel=${LARAVEL_SPANS:-0})"
else
  log_fail "traceparent manual NÃO preservado pela cadeia (nestjs=${NESTJS_SPANS:-0} express=${EXPRESS_SPANS:-0} laravel=${LARAVEL_SPANS:-0})"
fi

# ── Debug endpoint check ───────────────────────────────────────────────────────
log_header "Debug — Endpoints de diagnóstico de headers"

check_debug_endpoint() {
  local svc="$1" url="$2"
  local resp
  resp=$(curl -sf "$url" \
    -H "traceparent: 00-12345678901234567890123456789012-1234567890123456-01" \
    -H "baggage: page.route=test" \
    2>/dev/null)
  local has_tp
  has_tp=$(echo "$resp" | grep -o '"traceparent":true' | head -1)
  if [[ "$has_tp" == '"traceparent":true' ]]; then
    log_pass "$svc /debug/headers detecta traceparent"
  else
    log_fail "$svc /debug/headers não detecta traceparent (resp: $resp)"
  fi
}

check_debug_endpoint "NestJS"  "$NESTJS_BASE/debug/headers"
check_debug_endpoint "Express" "$EXPRESS_BASE/debug/headers"
check_debug_endpoint "Laravel" "$LARAVEL_BASE/api/debug/headers"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}RESULTADO FINAL${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}PASS:${RESET}   $PASS"
echo -e "  ${RED}FAIL:${RESET}   $FAIL"
[[ "$SKIP" -gt 0 ]] && echo -e "  ${YELLOW}SKIP:${RESET}   $SKIP"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ Todos os cenários passaram!${RESET}"
  echo ""
  echo "  [PASS] curl → NestJS preserva trace_id recebido"
  echo "  [PASS] curl → Express preserva trace_id recebido"
  echo "  [PASS] curl → Laravel preserva trace_id recebido"
  echo "  [PASS] traceparent manual → NestJS preserva trace_id"
  echo "  [PASS] traceparent manual → Express preserva trace_id"
  echo "  [PASS] traceparent manual → Laravel preserva trace_id"
  echo "  [PASS] NestJS → Express gera 1 trace com nestjs + express"
  echo "  [PASS] NestJS → Laravel gera 1 trace com nestjs + laravel"
  echo "  [PASS] Express → Laravel gera 1 trace com express + laravel"
  echo "  [PASS] cadeia completa gera 1 trace com nestjs + express + laravel"
  echo "  [PASS] CORS permite traceparent, tracestate e baggage"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}✗ $FAIL cenário(s) falharam.${RESET}"
  echo ""
  exit 1
fi
