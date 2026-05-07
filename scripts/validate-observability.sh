#!/usr/bin/env bash
set -uo pipefail

NESTJS_BASE="${NESTJS_BASE:-http://localhost:3010}"
EXPRESS_BASE="${EXPRESS_BASE:-http://localhost:3020}"
LARAVEL_BASE="${LARAVEL_BASE:-http://localhost:8085}"
CH_CONTAINER="${CH_CONTAINER:-signoz-clickhouse}"
FLUSH_WAIT="${FLUSH_WAIT:-15}"

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); echo "  [PASS] $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; }

ch() { docker exec "$CH_CONTAINER" clickhouse-client --query "$1" 2>&1; }

apply_config() {
  local profile="$1" cb="$2" cr="$3" ld="$4"
  local payload
  payload=$(printf '{"profile":"%s","captureBody":%s,"captureResponse":%s,"logDestination":"%s"}' "$profile" "$cb" "$cr" "$ld")
  for url in "$NESTJS_BASE/admin/config" "$EXPRESS_BASE/admin/config" "$LARAVEL_BASE/api/admin/config"; do
    curl -sf -X PUT -H 'Content-Type: application/json' -d "$payload" "$url" > /dev/null \
      || { bad "PUT $url failed"; return 1; }
  done
}

check_admin_get() {
  local expected_profile="$1" expected_ld="$2"
  for ep in "nestjs:$NESTJS_BASE/admin/config" "express:$EXPRESS_BASE/admin/config" "laravel:$LARAVEL_BASE/api/admin/config"; do
    local svc="${ep%%:*}" url="${ep#*:}"
    local got p ld
    got=$(curl -sf "$url" 2>/dev/null)
    p=$(echo "$got" | grep -o '"profile":"[^"]*"' | head -1 | cut -d'"' -f4)
    ld=$(echo "$got" | grep -o '"logDestination":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ "$p" == "$expected_profile" && "$ld" == "$expected_ld" ]]; then
      ok "$svc admin profile=$p ld=$ld"
    else
      bad "$svc admin profile=$p ld=$ld (expected p=$expected_profile ld=$expected_ld)"
    fi
  done
}

call_chain() {
  curl -sf -i "$NESTJS_BASE/chain" | grep -i '^x-trace-id:' | tr -d '\r' | awk '{print $2}'
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then ok "$label = '$actual'"; else bad "$label = '$actual' (expected '$expected')"; fi
}
assert_ge() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -ge "$expected" ]]; then ok "$label = $actual (>= $expected)"; else bad "$label = $actual (expected >= $expected)"; fi
}

assert_trace() {
  local label="$1" tid="$2" exp_profile="$3" exp_body="$4" exp_resp="$5" exp_logs="$6" exp_log_svcs="$7"

  local span_cnt svc_count
  span_cnt=$(ch "SELECT count() FROM signoz_traces.signoz_index_v3 WHERE trace_id='$tid'")
  assert_ge "spans" 6 "${span_cnt:-0}"
  svc_count=$(ch "SELECT count(DISTINCT resource_string_service\$\$name) FROM signoz_traces.signoz_index_v3 WHERE trace_id='$tid'")
  assert_eq "distinct services on trace" 3 "${svc_count:-0}"

  local profile_rows
  profile_rows=$(ch "SELECT DISTINCT resource_string_service\$\$name AS service, attributes_string['haoc.otel.profile'] AS profile FROM signoz_traces.signoz_index_v3 WHERE trace_id='$tid' AND has(mapKeys(attributes_string), 'haoc.otel.profile') ORDER BY service FORMAT TabSeparated")
  echo "    [span profile per service (server-spans only)]"
  echo "$profile_rows" | sed 's/^/      /'
  local tagged_svcs
  tagged_svcs=$(echo "$profile_rows" | awk 'NF>=2 {print $1}' | sort -u | wc -l | tr -d ' ')
  assert_eq "services with haoc.otel.profile-tagged spans" 3 "$tagged_svcs"
  local mismatched
  mismatched=$(echo "$profile_rows" | awk -v want="$exp_profile" 'NF>=2 && $2 != want { print $1"="$2 }' | tr '\n' ' ')
  if [[ -z "$mismatched" ]]; then ok "every tagged span has haoc.otel.profile=$exp_profile"; else bad "wrong span profile on: $mismatched (expected $exp_profile)"; fi

  local body_attr resp_attr
  body_attr=$(ch "SELECT count() FROM signoz_traces.signoz_index_v3 WHERE trace_id='$tid' AND arrayExists(k -> startsWith(k, 'haoc.request.body.'), mapKeys(attributes_string))")
  if [[ "$exp_body" == "yes" ]]; then assert_ge "spans w/ haoc.request.body.* attrs" 1 "${body_attr:-0}"; else assert_eq "spans w/ haoc.request.body.* attrs" 0 "${body_attr:-0}"; fi
  resp_attr=$(ch "SELECT count() FROM signoz_traces.signoz_index_v3 WHERE trace_id='$tid' AND arrayExists(k -> startsWith(k, 'haoc.response.body.'), mapKeys(attributes_string))")
  if [[ "$exp_resp" == "yes" ]]; then assert_ge "spans w/ haoc.response.body.* attrs" 1 "${resp_attr:-0}"; else assert_eq "spans w/ haoc.response.body.* attrs" 0 "${resp_attr:-0}"; fi

  local log_cnt
  log_cnt=$(ch "SELECT count() FROM signoz_logs.distributed_logs_v2 WHERE trace_id='$tid'")
  assert_eq "log count for trace" "$exp_logs" "${log_cnt:-0}"
  if [[ "$exp_logs" -gt 0 ]]; then
    local got_log_svcs
    got_log_svcs=$(ch "SELECT DISTINCT resources_string['service.name'] FROM signoz_logs.distributed_logs_v2 WHERE trace_id='$tid' ORDER BY 1 FORMAT TabSeparated" | tr '\n' ',' | sed 's/,$//')
    assert_eq "log services on trace" "$exp_log_svcs" "$got_log_svcs"
    local log_profile_rows
    log_profile_rows=$(ch "SELECT DISTINCT resources_string['service.name'] AS service, attributes_string['haoc.otel.profile'] AS profile FROM signoz_logs.distributed_logs_v2 WHERE trace_id='$tid' ORDER BY service FORMAT TabSeparated")
    echo "    [log profile per service]"
    echo "$log_profile_rows" | sed 's/^/      /'
    local log_mismatched
    log_mismatched=$(echo "$log_profile_rows" | awk -v want="$exp_profile" '$2 != want { print $1"="$2 }' | tr '\n' ' ')
    if [[ -z "$log_mismatched" ]]; then ok "every log has haoc.otel.profile=$exp_profile"; else bad "wrong log profile on: $log_mismatched (expected $exp_profile)"; fi
  fi
}

run_scenario() {
  local label="$1" profile="$2" cb="$3" cr="$4" ld="$5" exp_logs="$6" exp_log_svcs="$7" exp_body="$8" exp_resp="$9"
  echo
  echo "================================================================"
  echo "  Scenario $label - profile=$profile cb=$cb cr=$cr ld=$ld"
  echo "================================================================"
  apply_config "$profile" "$cb" "$cr" "$ld" || return
  sleep 2
  check_admin_get "$profile" "$ld"
  sleep 1
  curl -sf "$NESTJS_BASE/chain" > /dev/null || true
  sleep 2
  local tid
  tid=$(call_chain)
  if [[ -z "$tid" ]]; then bad "no trace_id from /chain"; return; fi
  ok "captured trace_id=$tid"
  echo "  flushing $FLUSH_WAIT s..."
  sleep "$FLUSH_WAIT"
  assert_trace "$label" "$tid" "$profile" "$exp_body" "$exp_resp" "$exp_logs" "$exp_log_svcs"
}

echo "============================================================"
echo "  @haocruz/opentelemetry e2e SigNoz validation"
echo "============================================================"

run_scenario "A1 minimal-both"          "minimal"  "false" "false" "both"    6 "playground-express,playground-laravel,playground-nestjs" "no"  "no"
run_scenario "A2 standard-both"         "standard" "true"  "true"  "both"    6 "playground-express,playground-laravel,playground-nestjs" "no"  "yes"
run_scenario "A3 verbose-both"          "verbose"  "true"  "true"  "both"    6 "playground-express,playground-laravel,playground-nestjs" "no"  "yes"
run_scenario "A4 back-to-minimal"       "minimal"  "false" "false" "both"    6 "playground-express,playground-laravel,playground-nestjs" "no"  "no"
run_scenario "B1 standard-signoz-only"  "standard" "true"  "true"  "signoz"  6 "playground-express,playground-laravel,playground-nestjs" "no"  "yes"
run_scenario "B2 standard-console-only" "standard" "true"  "true"  "console" 0 "" "no"  "yes"
run_scenario "B3 minimal-none"          "minimal"  "false" "false" "none"    0 "" "no"  "no"

echo
echo "================================================================"
echo "  Scenario C1 - POST /echo body capture + redaction"
echo "================================================================"
apply_config "standard" "true" "true" "both"
sleep 2
post_resp=$(curl -sf -i -X POST -H 'Content-Type: application/json' -d '{"name":"João","cpf":"12345678900","password":"S3cret!","email":"x@y.com"}' "$EXPRESS_BASE/echo")
TID_POST=$(echo "$post_resp" | grep -i '^x-trace-id:' | tr -d '\r' | awk '{print $2}')
if [[ -z "$TID_POST" ]]; then bad "no trace_id from POST /echo"; else
  ok "captured trace_id=$TID_POST"
  sleep "$FLUSH_WAIT"
  body_name=$(ch "SELECT attributes_string['haoc.request.body.name']     FROM signoz_traces.signoz_index_v3 WHERE trace_id='$TID_POST' AND attributes_string['haoc.request.body.name']     != '' LIMIT 1")
  body_em=$(ch   "SELECT attributes_string['haoc.request.body.email']    FROM signoz_traces.signoz_index_v3 WHERE trace_id='$TID_POST' AND attributes_string['haoc.request.body.email']    != '' LIMIT 1")
  body_cpf=$(ch  "SELECT attributes_string['haoc.request.body.cpf']      FROM signoz_traces.signoz_index_v3 WHERE trace_id='$TID_POST' AND attributes_string['haoc.request.body.cpf']      != '' LIMIT 1")
  body_pwd=$(ch  "SELECT attributes_string['haoc.request.body.password'] FROM signoz_traces.signoz_index_v3 WHERE trace_id='$TID_POST' AND attributes_string['haoc.request.body.password'] != '' LIMIT 1")
  assert_eq "body.name (clear)"      "João"       "${body_name:-}"
  assert_eq "body.email (clear)"     "x@y.com"    "${body_em:-}"
  assert_eq "body.cpf (redacted)"    "[REDACTED]" "${body_cpf:-}"
  assert_eq "body.password (redact)" "[REDACTED]" "${body_pwd:-}"
  post_profile=$(ch "SELECT DISTINCT attributes_string['haoc.otel.profile'] FROM signoz_traces.signoz_index_v3 WHERE trace_id='$TID_POST' AND has(mapKeys(attributes_string), 'haoc.otel.profile') LIMIT 1 FORMAT TabSeparated")
  assert_eq "POST span haoc.otel.profile" "standard" "$post_profile"
fi

echo
echo "================================================================"
echo "Summary: $PASS pass, $FAIL fail"
echo "================================================================"
[[ $STRICT -eq 1 && $FAIL -gt 0 ]] && exit 1
exit 0
