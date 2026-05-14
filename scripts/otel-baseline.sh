#!/usr/bin/env bash
# =============================================================================
# scripts/otel-baseline.sh
# Baseline de validação do monorepo haoc-opentelemetry
#
# Uso:
#   bash scripts/otel-baseline.sh [--clickhouse] [--all]
#
# Flags:
#   --clickhouse   Inclui consultas no ClickHouse (requer signoz-clickhouse up)
#   --all          Executa tudo incluindo ClickHouse
#
# Pré-requisitos:
#   - docker compose up (playground) rodando em playground_playground network
#   - signoz-clickhouse rodando (para --clickhouse)
# =============================================================================
set -euo pipefail

NETWORK="playground_playground"
CURL="docker run --rm --network $NETWORK curlimages/curl:8.8.0"
CLICKHOUSE_CONTAINER="signoz-clickhouse"
NESTJS="http://nestjs-app:3010"
EXPRESS="http://express-app:3020"
LARAVEL="http://laravel-app:8080"

WITH_CLICKHOUSE=false
for arg in "$@"; do
  case $arg in
    --clickhouse|--all) WITH_CLICKHOUSE=true ;;
  esac
done

SEPARATOR="=================================================================="
CHAIN_TRACE_ID=""

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()  { echo -e "  \033[1;32m✓\033[0m $*"; }
warn(){ echo -e "  \033[1;33m⚠\033[0m $*"; }
err() { echo -e "  \033[1;31m✗\033[0m $*"; }

# ---------------------------------------------------------------------------
# 1. ESTADO INICIAL - /admin/config
# ---------------------------------------------------------------------------
log "1. Estado inicial dos serviços"
echo ""

for svc in nestjs express laravel; do
  case $svc in
    nestjs)  url="$NESTJS/admin/config" ;;
    express) url="$EXPRESS/admin/config" ;;
    laravel) url="$LARAVEL/api/admin/config" ;;
  esac
  echo "--- $svc ---"
  $CURL -s "$url" | python3 -m json.tool 2>/dev/null || $CURL -s "$url"
  echo ""
done

# ---------------------------------------------------------------------------
# 2. CICLO DE PROFILES — NestJS
# ---------------------------------------------------------------------------
log "2. Ciclo minimal → standard → verbose → minimal (NestJS)"

BODY='{"user":{"name":"Joao","cpf":"12345678900"},"password":"secret"}'

for profile in minimal standard verbose; do
  echo ""
  echo "$SEPARATOR"
  echo "  PROFILE: $profile (nestjs)"
  echo "$SEPARATOR"

  case $profile in
    minimal)  payload='{"profile":"minimal","captureBody":false,"captureResponse":false,"logDestination":"both"}' ;;
    standard) payload='{"profile":"standard","captureBody":false,"captureResponse":false,"logDestination":"both"}' ;;
    verbose)  payload='{"profile":"verbose","captureBody":true,"captureResponse":true,"logDestination":"both"}' ;;
  esac

  echo "  [SET CONFIG]"
  $CURL -s -X PUT "$NESTJS/admin/config" -H 'Content-Type: application/json' -d "$payload"
  echo ""

  sleep 1

  echo "  [POST /echo com dados sensíveis]"
  ECHO_RESP=$($CURL -s -X POST "$NESTJS/echo" -H 'Content-Type: application/json' -d "$BODY")
  echo "$ECHO_RESP" | python3 -m json.tool 2>/dev/null || echo "$ECHO_RESP"
  echo ""

  echo "  [OPTIONS preflight]"
  $CURL -s -X OPTIONS "$NESTJS/echo" \
    -H 'Origin: http://localhost:8090' \
    -H 'Access-Control-Request-Method: POST' \
    -D - 2>&1 | head -6
  echo ""
done

# ---------------------------------------------------------------------------
# 3. CICLO DE PROFILES — Express
# ---------------------------------------------------------------------------
log "3. Ciclo minimal → verbose (Express)"

for profile in minimal verbose; do
  echo ""
  echo "$SEPARATOR"
  echo "  PROFILE: $profile (express)"
  echo "$SEPARATOR"

  case $profile in
    minimal) payload='{"profile":"minimal","captureBody":false,"captureResponse":false}' ;;
    verbose) payload='{"profile":"verbose","captureBody":true,"captureResponse":true}' ;;
  esac

  echo "  [SET CONFIG]"
  $CURL -s -X PUT "$EXPRESS/admin/config" -H 'Content-Type: application/json' -d "$payload"
  echo ""

  sleep 1

  echo "  [POST /echo]"
  $CURL -s -X POST "$EXPRESS/echo" -H 'Content-Type: application/json' -d "$BODY" | python3 -m json.tool 2>/dev/null
  echo ""
done

# ---------------------------------------------------------------------------
# 4. CICLO DE PROFILES — Laravel
# ---------------------------------------------------------------------------
log "4. Ciclo minimal → verbose (Laravel)"

for profile in minimal verbose; do
  echo ""
  echo "$SEPARATOR"
  echo "  PROFILE: $profile (laravel)"
  echo "$SEPARATOR"

  case $profile in
    minimal) payload='{"profile":"minimal","captureBody":false,"captureResponse":false}' ;;
    verbose) payload='{"profile":"verbose","captureBody":true,"captureResponse":true}' ;;
  esac

  echo "  [SET CONFIG]"
  $CURL -s -X PUT "$LARAVEL/api/admin/config" -H 'Content-Type: application/json' -d "$payload"
  echo ""

  sleep 1

  echo "  [POST /api/echo] (traceId via header X-Trace-Id)"
  $CURL -s -v -X POST "$LARAVEL/api/echo" \
    -H 'Content-Type: application/json' \
    -d "$BODY" 2>&1 | grep -E 'X-Trace-Id|< HTTP|^\{' | head -5
  echo ""
done

# ---------------------------------------------------------------------------
# 5. RESET PARA STANDARD + CHAMADA /chain
# ---------------------------------------------------------------------------
log "5. Reset para standard e chamada /chain"

$CURL -s -X PUT "$NESTJS/admin/config"  -H 'Content-Type: application/json' -d '{"profile":"standard","captureBody":false,"captureResponse":false,"logDestination":"both"}' > /dev/null
$CURL -s -X PUT "$EXPRESS/admin/config" -H 'Content-Type: application/json' -d '{"profile":"standard","captureBody":false,"captureResponse":false,"logDestination":"both"}' > /dev/null
$CURL -s -X PUT "$LARAVEL/api/admin/config" -H 'Content-Type: application/json' -d '{"profile":"standard","captureBody":false,"captureResponse":false,"logDestination":"both"}' > /dev/null
ok "Todos em standard"

sleep 1

echo ""
echo "--- GET /chain (trace distribuído NestJS→Express→Laravel) ---"
CHAIN_RESPONSE=$($CURL -s -D - "http://nestjs-app:3010/chain" 2>&1)
echo "$CHAIN_RESPONSE"
CHAIN_TRACE_ID=$(echo "$CHAIN_RESPONSE" | grep -i 'X-Trace-Id' | grep -oE '[0-9a-f]{32}' | head -1)
echo ""
if [[ -n "$CHAIN_TRACE_ID" ]]; then
  ok "traceId capturado (header): $CHAIN_TRACE_ID"
else
  warn "traceId não encontrado no header X-Trace-Id"
  CHAIN_TRACE_ID=$(echo "$CHAIN_RESPONSE" | grep -oE '"traceId":"[0-9a-f]{32}"' | head -1 | grep -oE '[0-9a-f]{32}')
  [[ -n "$CHAIN_TRACE_ID" ]] && ok "traceId do body: $CHAIN_TRACE_ID"
fi

# ---------------------------------------------------------------------------
# 6. CLICKHOUSE — SPANS
# ---------------------------------------------------------------------------
if $WITH_CLICKHOUSE; then
  log "6. Spans no ClickHouse (últimos 15 min)"

  docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  formatDateTime(timestamp, '%H:%i:%S') AS ts,
  serviceName,
  name,
  round(durationNano/1e6, 2) AS duration_ms,
  attributes_string['http.method']          AS old_http_method,
  attributes_string['http.request.method']  AS new_http_method,
  attributes_string['http.route']           AS http_route,
  attributes_number['http.status_code']     AS old_status,
  attributes_number['http.response.status_code'] AS new_status,
  traceID
FROM signoz_traces.signoz_index_v3
WHERE timestamp > now() - INTERVAL 15 MINUTE
ORDER BY timestamp DESC
LIMIT 60
FORMAT Pretty
"

  # ---------------------------------------------------------------------------
  # 7. CLICKHOUSE — SPANS PARA O /chain TRACE
  # ---------------------------------------------------------------------------
  if [[ -n "$CHAIN_TRACE_ID" ]]; then
    log "7. Spans do trace /chain: $CHAIN_TRACE_ID"
    docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  serviceName,
  name,
  round(durationNano/1e6, 2) AS duration_ms,
  attributes_string['http.method']         AS old_http_method,
  attributes_string['http.request.method'] AS new_http_method,
  attributes_string['http.route']          AS http_route,
  toFloat64(attributes_number['http.status_code'])    AS old_status,
  parentSpanID
FROM signoz_traces.signoz_index_v3
WHERE traceID = '${CHAIN_TRACE_ID}'
ORDER BY timestamp ASC
FORMAT Pretty
"
  fi

  # ---------------------------------------------------------------------------
  # 8. CLICKHOUSE — LOGS
  # ---------------------------------------------------------------------------
  log "8. Logs no ClickHouse (últimos 15 min)"

  docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  toString(toDateTime(intDiv(timestamp, 1000000000))) AS ts,
  resources_string['service.name'] AS service,
  trace_id,
  severity_text,
  substring(body, 1, 100) AS body_preview,
  attributes_string['haoc.otel.profile'] AS profile
FROM signoz_logs.distributed_logs_v2
WHERE timestamp > (toUInt64(now()) - 900) * 1000000000
ORDER BY timestamp DESC
LIMIT 60
FORMAT Pretty
"

  # ---------------------------------------------------------------------------
  # 9. CLICKHOUSE — LOGS DO /chain TRACE
  # ---------------------------------------------------------------------------
  if [[ -n "$CHAIN_TRACE_ID" ]]; then
    log "9. Logs do trace /chain: $CHAIN_TRACE_ID"
    docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  resources_string['service.name'] AS service,
  toString(toDateTime(intDiv(timestamp, 1000000000))) AS ts,
  severity_text,
  body,
  arrayStringConcat(mapKeys(attributes_string), ', ') AS attr_keys
FROM signoz_logs.distributed_logs_v2
WHERE trace_id = '${CHAIN_TRACE_ID}'
ORDER BY timestamp ASC
FORMAT Vertical
"
  fi

  # ---------------------------------------------------------------------------
  # 10. CLICKHOUSE — VERIFICAÇÃO DE SPANS INVÁLIDOS
  # ---------------------------------------------------------------------------
  log "10. Verificação de spans inválidos (http_method=N/A ou duration=0)"

  docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  serviceName,
  name,
  durationNano,
  attributes_string['http.method'] AS http_method
FROM signoz_traces.signoz_index_v3
WHERE timestamp > now() - INTERVAL 15 MINUTE
  AND (
    durationNano = 0
    OR attributes_string['http.method'] = 'N/A'
    OR attributes_string['http.request.method'] = 'N/A'
  )
ORDER BY timestamp DESC
LIMIT 20
FORMAT Pretty
"

  # ---------------------------------------------------------------------------
  # 11. CLICKHOUSE — VERIFICAÇÃO DE OPTIONS NOS SPANS
  # ---------------------------------------------------------------------------
  log "11. OPTIONS nos spans (últimos 15 min)"

  docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  serviceName,
  name,
  round(durationNano/1e6, 2) AS duration_ms,
  attributes_string['http.method'] AS http_method,
  traceID
FROM signoz_traces.signoz_index_v3
WHERE timestamp > now() - INTERVAL 15 MINUTE
  AND (name = 'OPTIONS' OR attributes_string['http.method'] = 'OPTIONS')
ORDER BY timestamp DESC
LIMIT 20
FORMAT Pretty
"

  # ---------------------------------------------------------------------------
  # 12. CLICKHOUSE — PAYLOAD FLATTENADO NOS LOGS
  # ---------------------------------------------------------------------------
  log "12. Payload flattenado nos atributos de log (body.* e response.*)"

  docker exec -i "$CLICKHOUSE_CONTAINER" clickhouse-client --query "
SELECT
  resources_string['service.name'] AS service,
  trace_id,
  substring(body, 1, 80) AS body,
  attributes_string['haoc.otel.profile'] AS profile,
  attributes_string['body.user.cpf']              AS cpf_req,
  attributes_string['body.password']              AS pwd_req,
  attributes_string['response.received.user.cpf'] AS cpf_res,
  attributes_string['response.received.password'] AS pwd_res
FROM signoz_logs.distributed_logs_v2
WHERE timestamp > (toUInt64(now()) - 900) * 1000000000
  AND (
    mapContains(attributes_string, 'body.user.cpf')
    OR mapContains(attributes_string, 'response.received.user.cpf')
  )
ORDER BY timestamp DESC
LIMIT 30
FORMAT Pretty
"

fi  # end WITH_CLICKHOUSE

# ---------------------------------------------------------------------------
# SUMÁRIO
# ---------------------------------------------------------------------------
log "SUMÁRIO DA VALIDAÇÃO"
echo ""
ok "Rede usada: $NETWORK (containers: nestjs-app:3010, express-app:3020, laravel-app:8080)"
ok "Ciclos de profile executados: minimal, standard, verbose"
ok "Chamada /chain executada"
[[ -n "$CHAIN_TRACE_ID" ]] && ok "traceId /chain: $CHAIN_TRACE_ID" || warn "traceId /chain: não capturado"
if $WITH_CLICKHOUSE; then
  ok "Consultas ClickHouse executadas (container: $CLICKHOUSE_CONTAINER)"
else
  warn "ClickHouse não consultado — execute com --clickhouse para queries completas"
fi
echo ""
