# VALIDATION GUIDE — `@haocruz/opentelemetry` end-to-end no Playground

> Guia operacional para reproduzir, scenario-a-scenario, a validação completa
> do plugin `@haocruz/opentelemetry` (Node + Laravel + Web) contra uma
> instância real do SigNoz, exercitando troca dinâmica de profile e captura
> de body/response.

---

## 1 · Pré-requisitos

| Componente | Versão / Caminho | Como subir |
|---|---|---|
| Docker + Compose v2 | qualquer recente | já instalados |
| SigNoz local | `/home/japostulo/projects/signoz` | `cd ../../signoz && docker compose up -d` |
| Playground (3 backends + web-app) | `playground/docker-compose.yml` | `cd playground && docker compose up -d --build` |
| Node 22 (para builds locais) | `~/.nvm/versions/node/v22.16.0` | `export PATH=~/.nvm/versions/node/v22.16.0/bin:$PATH` |

Healthcheck rápido (todos devem responder `200`):

```bash
curl -sf -o /dev/null -w 'nestjs:%{http_code}\n' http://localhost:3010/admin/config
curl -sf -o /dev/null -w 'express:%{http_code}\n' http://localhost:3020/admin/config
curl -sf -o /dev/null -w 'laravel:%{http_code}\n' http://localhost:8085/api/admin/config
curl -sf -o /dev/null -w 'web:%{http_code}\n'    http://localhost:8090/
```

---

## 2 · Topologia de teste

```
                       ┌─────────────────────────────────────────────────┐
                       │  Web App (Vue 3 + Vuetify) — :8090              │
                       │  /profile-builder ─ ProfileBuilderView.vue      │
                       └───────────────┬─────────────────────────────────┘
                                       │ PUT /admin/config (3 fan-out)
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       ▼                               ▼                               ▼
┌────────────────┐            ┌────────────────┐            ┌────────────────────┐
│  NestJS :3010  │            │  Express :3020 │            │  Laravel :8085→8080│
│  /admin/config │            │  /admin/config │            │  /api/admin/config │
│  /chain  (GET) │ ─────────▶ │  /chain  (GET) │ ─────────▶ │  /api/hello  (GET) │
└────────────────┘            └────────────────┘            └────────────────────┘
       │ traceparent (W3C)            │ traceparent                  │
       └─────────────┬────────────────┴──────────────┬───────────────┘
                     ▼                               ▼
        ┌────────────────────────┐    ┌────────────────────────┐
        │  OTel Collector :4318  │    │  OTel Collector :4318  │
        └───────────┬────────────┘    └───────────┬────────────┘
                    ▼                             ▼
              ┌─────────────────────────────────────────────┐
              │  SigNoz ClickHouse (signoz-clickhouse)      │
              │  · signoz_traces.signoz_index_v3   (spans)  │
              │  · signoz_logs.distributed_logs_v2 (logs)   │
              └─────────────────────────────────────────────┘
```

* `GET /chain` na NestJS gera **6 spans** (HTTP server + outgoing client em
  cada um dos 3 serviços) e **6 logs** (request + response em cada um),
  todos compartilhando o mesmo `trace_id` propagado via `traceparent`.

---

## 3 · Suite automatizada — `scripts/validate-observability.sh`

Localização: [scripts/validate-observability.sh](../scripts/validate-observability.sh)

```bash
bash scripts/validate-observability.sh             # modo report
bash scripts/validate-observability.sh --strict    # exit 1 em qualquer fail
FLUSH_WAIT=20 bash scripts/validate-observability.sh   # ajustar wait do BSP
```

A suite executa 7 cenários de profile/log-destination + 1 cenário POST
com redaction. Cada cenário é validado **inline** (apply → chamada →
flush → assert → próximo). Isso é obrigatório porque o
`GatedLogExporter` decide gating no momento do **export**, não da
emissão do log; se rodássemos todos os cenários e assértássemos no fim,
um cenário com `ld=console` posterior dropparia logs ainda enfileirados
de cenários anteriores.

Para cada cenário o script:

1. `PUT /admin/config` nos 3 backends e `sleep 2` (propagação env).
2. `GET /admin/config` em cada um — prova que profile + logDestination
   foram aplicados.
3. Warm-up `/chain` (descartado).
4. `GET /chain` validado — captura `X-Trace-Id`.
5. Sleep `FLUSH_WAIT=15s` (default) — BatchProcessor + lag distribuído.
6. **Asserções por valor** no ClickHouse:
   - `count() >= 6` spans, **3 serviços distintos**.
   - **Para cada span servidor** (filtrando `has(mapKeys, 'haoc.otel.profile')`):
     `attributes_string['haoc.otel.profile'] == <profile esperado>`.
   - Presença/ausência de `haoc.request.body.*` e `haoc.response.body.*` conforme cb/cr.
   - `count()` exato de logs por trace + lista exata de serviços.
   - **Para cada log:** `attributes_string['haoc.otel.profile'] ==
     <profile esperado>`.

### Resultado da última execução

```
Summary: 93 pass, 0 fail
```

---

## 4 · Cenários, um a um

Convenções: `cb` = `captureBody`, `cr` = `captureResponse`, `ld` = `logDestination`.

### 4.1 · Cenário A — `minimal | cb=false | cr=false | ld=both`

**O que aconteceu:**

* Cliente bateu em `GET http://localhost:3010/chain` (NestJS) → controller
  fez `fetch('http://express-app:3020/chain')` → Express fez `fetch(
  'http://laravel-app:8080/api/hello')` → Laravel respondeu `{message:
  'Hello from Laravel playground!'}`. Resposta voltou em cascata.
* `traceparent` propagado automaticamente pelo `instrumentation-http`,
  resultando em `trace_id` único compartilhado pelos 3 spans servidores
  e 3 spans clientes.

**O que foi gravado:**

* **6 spans** em `signoz_traces.signoz_index_v3`, cobrindo
  `playground-nestjs`, `playground-express`, `playground-laravel`.
* **6 logs** em `signoz_logs.distributed_logs_v2` (request + response em
  cada serviço), também os 3 nomes de serviço.
* `haoc.request.body.*` **ausente** nos atributos de span — comportamento esperado
  porque `cb=false`.
* `haoc.response.body.*` **ausente** nos atributos de span — comportamento
  esperado porque `cr=false`.

**Por que importa:** comprova que no profile mais restritivo o
*esqueleto* da observabilidade (traces + logs correlacionados) continua
fluindo, sem vazar payload sensível.

### 4.2 · Cenário B — `standard | cb=true | cr=true | ld=both`

* Mesmo fluxo encadeado.
* **6 spans** + **6 logs**.
* **3 spans com atributos `haoc.response.body.*`** (um por serviço HTTP-server).
  Conteúdo do response (incluindo o `downstream` aninhado) é serializado
  pelo `flattenToSpan/flattenToRecord` com redaction de campos
  sensíveis.
* `haoc.request.body.*` permanece ausente *neste cenário* apenas porque a chamada
  é `GET` (sem body). Validamos `haoc.request.body.*` em §5 com POST.

**Por que importa:** prova que `captureBody=true` + `captureResponse=true`
*efetivamente* aterrissa nos 3 serviços (NestJS bug original era que só 2
de 3 reagiam).

### 4.3 · Cenário C — `verbose | cb=true | cr=true | ld=both`

* Mesma cadeia.
* **6 spans + 6 logs + atributos response.* presentes** (3 spans).
* No verbose também ficam ativas instrumentações como `fs`, `dns`, `net`
  (não verificadas pelo script, mas configuradas em `profile.ts`).

**Por que importa:** garante que `verbose` não quebra nada que `standard`
já fazia.

### 4.4 · Cenário D — `standard | cb=false | cr=false | ld=signoz`

* Mesma cadeia.
* **6 spans** (sem atributos `haoc.response.body.*` nem `haoc.request.body.*`).
* **6 logs em ClickHouse**, mas **stdout dos containers fica sem o log
  de request/response** (o pino-pretty / pino/file não emite quando
  `LOG_DESTINATION=signoz` — a `console transport` é desligada via
  `buildLoggerConfig`).

**Por que importa:** prova o caminho “só SigNoz” do `LOG_DESTINATION`.

### 4.5 · Cenário E — `standard | cb=true | cr=true | ld=console`

* Mesma cadeia.
* **6 spans + atributos response.* nos 3 servidores**.
* `count()` em `signoz_logs.distributed_logs_v2` = **0**.
* `docker logs playground-nestjs-app-1 | tail` mostra request + response
  com o `trace_id` (logs vivos no console).

**Por que importa:** **ESTA É A PROVA DA CORREÇÃO `GatedLogExporter`.**
Antes do fix, mudar `LOG_DESTINATION` em runtime *não fazia nada* porque
o `BatchLogRecordProcessor` era construído (ou não) no boot. Agora o
processor está sempre montado e o `GatedLogExporter` decide *na hora do
export* se manda ou não para o OTLP, lendo `process.env.LOG_DESTINATION`.

### 4.6 · Cenário F — `minimal | cb=false | cr=false | ld=none`

* Mesma cadeia.
* **6 spans** (traces não dependem de `LOG_DESTINATION`).
* `count()` em logs = **0** (em ClickHouse e no console — pino é
  silenciado via `level: 'silent'`).

**Por que importa:** garante o modo *kill switch* total de logs.

---

## 5 · Validação manual de `captureBody` (POST com payload sensível)

A suite usa `GET /chain` para garantir propagação distribuída; para
exercitar `haoc.body` precisamos de um POST. NestJS não expõe POST
encadeado nativamente, mas o Express expõe `POST /echo`:

```bash
curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"profile":"standard","captureBody":true,"captureResponse":true,"logDestination":"both"}' \
  http://localhost:3020/admin/config

resp=$(curl -s -i -X POST -H 'Content-Type: application/json' \
  -d '{"name":"João","cpf":"12345678900","password":"S3cret!","email":"x@y.com"}' \
  http://localhost:3020/echo)

TID=$(echo "$resp" | grep -i '^x-trace-id:' | tr -d '\r' | awk '{print $2}')
echo "trace_id=$TID"
sleep 12

# Span attribute haoc.request.body.* com redaction
docker exec signoz-clickhouse clickhouse-client --query "
  SELECT name,
         attributes_string['haoc.request.body.name']     AS name_attr,
         attributes_string['haoc.request.body.cpf']      AS cpf_attr,
         attributes_string['haoc.request.body.password'] AS pwd_attr,
         attributes_string['haoc.request.body.email']    AS email_attr
  FROM signoz_traces.signoz_index_v3
  WHERE trace_id='$TID'
  FORMAT Vertical"
```

Esperado:

```
name_attr:   João
cpf_attr:    [REDACTED]      ← redaction default
pwd_attr:    [REDACTED]      ← redaction default
email_attr:  x@y.com
```

Os campos sensíveis configurados em
[`packages/node/src/utils/sanitize.ts`](../packages/node/src/logger/redaction.ts)
são interceptados pelo `flattenToSpan` e substituídos por `[REDACTED]`
**antes** de qualquer envio de span.

---

## 6 · Como ler tudo isso no SigNoz UI

1. Abrir `http://localhost:3301`.
2. **Traces** → filtrar por `trace_id=<o trace_id capturado>`. Esperar:
   * Diagrama de Gantt com 3 segmentos (NestJS → Express → Laravel).
   * Atributos no painel direito mostrando `haoc.response.body.*` e `haoc.request.body.*`
     conforme o cenário.
3. **Logs** → filtrar por `trace_id=<o trace_id>`. Esperar 6 entradas,
   2 por serviço, com `severity_text=INFO` e `body` no formato
   `GET /chain [trace_id]` ou `GET /chain 200 76ms [trace_id]`.

---

## 7 · Troubleshooting

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `spans count: got 0` ou `got 2` | `BatchSpanProcessor` ainda não descarregou | aumentar `FLUSH_WAIT` (default 15s) |
| `logs in SigNoz: got 0` no cenário `both` | OTLP collector caiu | `docker compose -f signoz/docker-compose.yml ps` |
| `nestjs profile=X applied` falha | NestJS container quebrou | `docker logs playground-nestjs-app-1 --tail 50` |
| `laravel profile=X applied` falha | Bug `Profile` singleton voltou | conferir [`HaocOpenTelemetryServiceProvider`](../packages/laravel/src/HaocOpenTelemetryServiceProvider.php) — deve ser `bind`, não `singleton` |
| Logs aparecem em `ld=console` | `GatedLogExporter` não está hookado | conferir [`tracing/setup.ts`](../packages/node/src/tracing/setup.ts) — deve usar `new GatedLogExporter(new OTLPLogExporter(...))` |
| NestJS sem logs em SigNoz | `otelEmit` não foi adicionado ao interceptor | conferir [`nestjs/trace.interceptor.ts`](../packages/node/src/nestjs/trace.interceptor.ts) por `otelEmit('info'...)` |

---

## 8 · O que NÃO está coberto pela suite

* **Persistência multi-pod** do runtime config — Laravel ainda usa
  `/tmp/haoc-runtime-config.json` (single-host); Node mantém em memória.
  Para production multi-réplica, mover para Redis.
* **Trace web → backend** (Vuetify SPA emitindo spans próprios via
  `@haocruz/opentelemetry-web`) — testado manualmente abrindo o profile
  builder no browser; não automatizado aqui.
* **Sampler dinâmico** — `sampleRatio` é lido no boot via
  `ParentBasedSampler`. Mudar via `/admin/config` requer restart do SDK
  (escopo deliberadamente excluído deste fix; ver `RESUMO_VALIDACAO.md`).
