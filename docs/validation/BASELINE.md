# Baseline de Observabilidade — haoc-opentelemetry

> Data de execução: 2026-05-07  
> Ambiente: playground local  
> SigNoz: `signoz-net` (ClickHouse: `signoz-clickhouse`)  
> Playground: rede `playground_playground`

---

## Infraestrutura

| Container | Imagem | Porta host | DNS interno |
|---|---|---|---|
| `playground-nestjs-app-1` | `playground-nestjs-app` | `3010` | `nestjs-app:3010` |
| `playground-express-app-1` | `playground-express-app` | `3020` | `express-app:3020` |
| `playground-laravel-app-1` | `playground-laravel-app` | `8085→8080` | `laravel-app:8080` |
| `playground-web-app-1` | `playground-web-app` | `8090` | `web-app:8090` |
| `signoz-clickhouse` | `clickhouse/clickhouse-server:25.5.6` | `9000` (interno) | — |
| `signoz-otel-collector` | `signoz-otel-collector:v0.144.2` | `4317/4318` | `host.docker.internal:4318` |

**Rede do playground**: `playground_playground` (172.21.0.0/16)  
**Rede do SigNoz**: `signoz-net` (172.22.0.0/16)  
Os containers do playground enviam traces/logs via `host.docker.internal:4318` (HTTP/OTLP).

---

## Estado Inicial dos Serviços (`/admin/config`)

```json
// NestJS
{"service":"nestjs","profile":"standard","captureBody":null,"captureResponse":null,"logDestination":"both"}

// Express
{"service":"express","profile":"standard","captureBody":null,"captureResponse":null,"logDestination":"both"}

// Laravel
{"service":"laravel","profile":"standard","captureBody":true,"captureResponse":true,"logDestination":"both"}
```

> **Nota**: Laravel inicia com `captureBody: true` e `captureResponse: true` por padrão, diferente dos serviços Node.

---

## Endpoints de Administração

| Serviço | Endpoint GET | Endpoint PUT |
|---|---|---|
| NestJS | `GET /admin/config` | `PUT /admin/config` |
| Express | `GET /admin/config` | `PUT /admin/config` |
| Laravel | `GET /api/admin/config` | `PUT /api/admin/config` |

---

## traceId — Localização

| Serviço | Localização do traceId |
|---|---|
| NestJS | `body.traceId` (JSON) |
| Express | `body.traceId` (JSON) |
| Laravel | Header `X-Trace-Id` (body não inclui traceId) |

---

## Ciclo de Profiles — Evidências

### NestJS

| Profile | PUT /admin/config | POST /echo retorna traceId? |
|---|---|---|
| `minimal` | ✓ `{"profile":"minimal","captureBody":false,"captureResponse":false}` | ✓ `57720bbf...` |
| `standard` | ✓ `{"profile":"standard","captureBody":false,"captureResponse":false}` | ✓ `a0053366...` |
| `verbose` | ✓ `{"profile":"verbose","captureBody":true,"captureResponse":true}` | ✓ `564c346b...` |

### Express

| Profile | Resultado |
|---|---|
| `minimal` | ✓ traceId `7ccb7aad...` |
| `verbose` | ✓ traceId `56441a03...` |

### Laravel

| Profile | Resultado |
|---|---|
| `minimal` | ✓ `X-Trace-Id: c360a3ef...` |
| `verbose` | ✓ `X-Trace-Id: c4d2cba5...` |

---

## Chamada /chain — Trace Distribuído

```
traceId: 8046a9c35a9519da2879c7e501f0b2e6
```

**Resposta:**
```json
{
  "service":"nestjs","traceId":"8046a9c35a9519da2879c7e501f0b2e6",
  "downstream":{
    "service":"express","traceId":"8046a9c35a9519da2879c7e501f0b2e6",
    "downstream":{
      "service":"laravel","traceId":"8046a9c35a9519da2879c7e501f0b2e6",
      "message":"Hello ..."
    }
  }
}
```

✅ **Propagação de trace confirmada**: mesmo `traceId` em NestJS, Express e Laravel.

---

## Spans no ClickHouse — Baseline

Tabela: `signoz_traces.signoz_index_v3`

### Spans do trace /chain (`8046a9c35a9519da2879c7e501f0b2e6`)

| ts | serviceName | name | duration_ms | old_http_method | new_http_method | http_route | old_status | new_status |
|---|---|---|---|---|---|---|---|---|
| 18:15:58 | playground-laravel | GET /api/hello | **0.01** | _(vazio)_ | _(vazio)_ | _(vazio)_ | 0 | 0 |
| 18:15:58 | playground-laravel | GET /api/hello | 5.18 | GET | _(vazio)_ | /api/hello | 200 | 0 |
| 18:15:58 | playground-express | GET | 130.49 | _(vazio)_ | **GET** | _(vazio)_ | 0 | **200** |
| 18:15:58 | playground-express | GET /chain | 225.28 | GET | _(vazio)_ | /chain | 200 | 0 |
| 18:15:58 | playground-nestjs | GET | 284.42 | _(vazio)_ | **GET** | _(vazio)_ | 0 | **200** |
| 18:15:58 | playground-nestjs | GET /chain | 344.05 | GET | _(vazio)_ | /chain | 200 | 0 |

### OPTIONS (NestJS)

| ts | name | duration_ms | http_method | traceID |
|---|---|---|---|---|
| 18:14:15 | OPTIONS | 9.68 | OPTIONS | `f9c0f3bb...` |
| 18:13:23 | OPTIONS | 1.90 | OPTIONS | `ba24f9f9...` |
| 18:13:52 | OPTIONS | 1.16 | OPTIONS | `4fdf9902...` |
| 18:13:43 | OPTIONS | 1.28 | OPTIONS | `b8f56f98...` |

---

## Achados — Spans

### ✅ O que funciona

1. **Propagação de trace distribuído**: NestJS → Express → Laravel compartilham o mesmo `traceId`.
2. **Spans gerados corretamente** para todos os serviços em todos os profiles.
3. **`/admin/config` aceita PUT** em runtime sem restart.
4. **Atributo `haoc.otel.profile`** está presente nos spans.

### ⚠️ Problemas identificados no baseline

| # | Serviço | Problema | Impacto |
|---|---|---|---|
| 1 | **Laravel** | **Span duplicado** para cada request: um com `duration≈0` e sem atributos HTTP, e um real. | Lixo no SigNoz, dupla cobrança de spans. |
| 2 | **NestJS, Express (server)** | Usam atributos **antigos** `http.method` + `http.status_code`. | Não conformes com OTel Semconv atual. |
| 3 | **NestJS, Express (client outbound)** | Usam atributos **novos** `http.request.method` + `http.response.status_code`. | Inconsistência dentro do mesmo trace. |
| 4 | **Laravel** | Usa somente atributos **antigos** (`http.method`, `http.status_code`). | Não conforme com OTel Semconv atual. |
| 5 | **NestJS** | **OPTIONS** gera span em **todos** os profiles (inclusive `minimal`). | Poluição de traces — preflight não deveria ser rastreado por padrão. |
| 6 | **NestJS, Express** | `http.route` está vazio nos spans de **cliente HTTP outbound**. | Sem rota no span de saída. |

---

## Logs no ClickHouse — Baseline

Tabela: `signoz_logs.distributed_logs_v2`

### Logs do trace /chain (`8046a9c35a9519da2879c7e501f0b2e6`)

| ts | service | trace_id | severity | body | profile |
|---|---|---|---|---|---|
| 18:15:58 | playground-nestjs | `8046a9c3...` | INFO | `GET /chain 333ms [8046a9c3...]` | standard |
| 18:15:58 | playground-express | `8046a9c3...` | info | `GET /chain 222ms [8046a9c3...]` | standard |
| 18:15:58 | playground-laravel | `8046a9c3...` | Info | `GET /api/hello 200 2ms [8046a9c3...]` | standard |
| 18:15:58 | playground-laravel | `8046a9c3...` | Info | `GET /api/hello [8046a9c3...]` | standard |
| 18:15:58 | playground-express | `8046a9c3...` | info | `GET /chain [8046a9c3...]` | standard |
| 18:15:58 | playground-nestjs | `8046a9c3...` | INFO | `GET /chain [8046a9c3...]` | standard |

✅ **Correlação trace_id confirmada**: todos os logs do /chain têm o mesmo `trace_id`.

### Atributos de payload nos logs (POST /echo — profile: todos)

```
Log de REQUEST (POST /echo [traceId]):
  attr_keys: body.user.name, body.user.cpf, http.method, http.route, haoc.otel.profile

Log de RESPONSE (POST /echo 201 Xms [traceId]):
  attr_keys: response.received.user.name, response.received.user.cpf, 
             response.received.password, http.method, http.route, 
             haoc.otel.profile, response.service, response.traceId
```

---

## Achados — Logs

### ✅ O que funciona

1. **Correlação trace_id** entre logs de NestJS, Express e Laravel no mesmo trace.
2. **Atributo `haoc.otel.profile`** está em todos os logs.
3. **Redação de dados sensíveis** funciona: `body.user.cpf` e `response.received.password` armazenados como `[REDACTED]`.
4. **Dupla emissão** por request (entrada + saída) com `trace_id` consistente.

### ⚠️ Problemas identificados no baseline

| # | Serviço | Problema | Impacto |
|---|---|---|---|
| 1 | **Todos** | **Payload flattenado** em atributos individuais (`body.user.name`, `body.user.cpf`, `response.*`) em **todos os profiles**, inclusive `minimal`. Regra 6 estabelece que `standard` não deveria fazer isso. | Viola regra de negócio. |
| 2 | **Todos** | **`body.password`** não aparece no log de REQUEST (não vira `[REDACTED]` — é simplesmente omitido). No log de RESPONSE, `response.received.password` aparece como `[REDACTED]`. | Comportamento inconsistente entre request e response. |
| 3 | **Laravel** | **2 logs por request** (entrada + saída) — mesmo padrão de Node, mas os logs de entrada e saída do Laravel têm `severity: Info` (capitalizado), diferente de Node (`INFO`/`info`). | Inconsistência de formato de severity entre serviços. |
| 4 | **NestJS** | `severity_text: INFO` (maiúsculo) | Inconsistência com Express (`info` minúsculo). |
| 5 | **Todos** | **OPTIONS não gera log** em nenhum profile. Gera span no NestJS mas sem log correspondente. | Inconsistência span ↔ log para OPTIONS. |
| 6 | **Todos** | **Sem log de OPTIONS** mesmo em `verbose`, onde deveria ser permitido. | Falta feature documentada. |

---

## Resumo Geral — Estado Atual vs. Regras Alvo

| Regra | Estado atual | Conformidade |
|---|---|---|
| OPTIONS só loga em verbose | OPTIONS não gera log em nenhum profile | ⚠️ Parcial (log OK, span sempre gerado no NestJS) |
| Payload não flattenado no standard | Flattenado em TODOS os profiles | ❌ Violação |
| Campos sensíveis redatados | CPF e senha → `[REDACTED]` | ✅ OK |
| Atributos OTel Semconv atuais | Server uses old `http.method`; client outbound uses new | ❌ Inconsistente |
| Trace distribuído / correlação | traceId propagado NestJS→Express→Laravel | ✅ OK |
| Runtime config sem restart | PUT /admin/config funciona | ✅ OK |
| `haoc.otel.profile` nos spans/logs | Presente em todos | ✅ OK |
| Laravel sem spans inválidos | Span duplicado com duration≈0 por request | ❌ Bug |
| OPTIONS não gera span por padrão | NestJS gera span OPTIONS em todos profiles | ❌ Violação |

---

## Como Reproduzir

```bash
# Baseline completo (sem ClickHouse)
bash scripts/otel-baseline.sh

# Com consultas ClickHouse
bash scripts/otel-baseline.sh --clickhouse

# Manualmente — descobrir containers
docker compose -f playground/docker-compose.yml ps
docker network inspect playground_playground

# Curl via rede Docker (substituir <svc> e <port>)
docker run --rm --network playground_playground curlimages/curl:8.8.0 \
  -s http://<svc>:<port>/admin/config

# ClickHouse — spans últimos 15min
docker exec -i signoz-clickhouse clickhouse-client --query "
SELECT serviceName, name, round(durationNano/1e6,2) AS ms,
       attributes_string['http.method'] AS method, traceID
FROM signoz_traces.signoz_index_v3
WHERE timestamp > subtractMinutes(now64(9), 15)
ORDER BY timestamp DESC LIMIT 50 FORMAT Pretty"

# ClickHouse — logs últimos 15min
docker exec -i signoz-clickhouse clickhouse-client --query "
SELECT resources_string['service.name'] AS svc,
       trace_id, severity_text, substring(body,1,100) AS body
FROM signoz_logs.distributed_logs_v2
WHERE toUInt64(timestamp/1000000000) > (toUInt64(now()) - 900)
ORDER BY timestamp DESC LIMIT 50 FORMAT Pretty"
```

---

## Próximos Passos (Atividade 2+)

Com base neste baseline, as correções prioritárias são:

1. **[ALTA]** Remover flattenação de payload em `standard` e `minimal` — payload deve ir para atributo estruturado no log (`haoc.http.request.body`) somente em `verbose`.
2. **[ALTA]** Corrigir span duplicado do Laravel (duration≈0 sem atributos).
3. **[MÉDIA]** Migrar atributos de servidor para nova semconv: `http.request.method`, `url.path`, `http.response.status_code`.
4. **[MÉDIA]** Suprimir span de OPTIONS fora do `verbose`.
5. **[MÉDIA]** Adicionar log de OPTIONS em `verbose`.
6. **[BAIXA]** Padronizar `severity_text`: `INFO` em todos os serviços.
