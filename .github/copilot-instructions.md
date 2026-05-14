# Contexto do Projeto — haoc-opentelemetry

## O que é este projeto

Monorepo de **bibliotecas de observabilidade padronizadas** para o ecossistema de aplicações do Hospital Alemão Oswaldo Cruz (HAOC). As libs instrumentam automaticamente tracing distribuído, logs estruturados, identidade de usuário e propagação de contexto W3C Baggage, exportando tudo via OTLP para o **SigNoz** (ClickHouse como backend).

---

## Estrutura do Monorepo

```
haoc-opentelemetry/
├── packages/
│   ├── node/        → @haocruz/opentelemetry       (TypeScript, Node.js)
│   ├── web/         → @haocruz/opentelemetry-web   (TypeScript, Browser/Electron)
│   └── laravel/     → haoc/opentelemetry-laravel   (PHP, Laravel 11+)
├── playground/
│   ├── nestjs-app/  → app NestJS de teste
│   ├── express-app/ → app Express de teste
│   ├── laravel-app/ → app Laravel de teste
│   └── web-app/     → app Web de teste (Vue)
└── docs/            → ATTRIBUTES.md, PROFILES.md, RUNTIME_CONFIG.md
```

---

## Pacote Node (`packages/node`)

**npm:** `@haocruz/opentelemetry`

Fornece tracing, logs Pino e integração NestJS/Express.

### Estrutura interna

```
src/
├── core/
│   └── semantic-attributes.ts   ← todas as constantes de atributo
├── tracing/
│   ├── setup.ts                 ← setupTracing()
│   ├── profile.ts               ← resolveProfile(), getRuntimeProfile()
│   └── types.ts                 ← OtelConfig, OtelProfileName
├── logger/
│   ├── config.ts                ← buildLoggerConfig() — pino-http options
│   ├── otel-emit.ts             ← otelEmit() — emissão direta via OTel Logs API
│   ├── gated-exporter.ts        ← GatedLogExporter — deduplica registros pino×otelEmit
│   └── redaction.ts             ← mergeRedactPaths()
├── nestjs/
│   ├── logger.module.ts         ← OtelModule.forRoot() — módulo NestJS
│   ├── trace.interceptor.ts     ← OtelInterceptor — interceptor global HTTP
│   ├── bootstrap.ts             ← configureApp() — setup do NestApp
│   └── types.ts                 ← OtelModuleConfig
├── express/
│   └── trace.middleware.ts      ← createTraceMiddleware(), createPinoMiddleware()
├── identity/
│   └── index.ts                 ← setUser(), getUser(), identifyUser()
└── utils/
    ├── flatten.ts               ← flattenToSpan(), flattenToRecord()
    └── sanitize.ts              ← mergeSensitiveFields(), DEFAULT_SENSITIVE_FIELDS
```

### APIs principais

```typescript
// Inicialização — DEVE ser a primeira linha do arquivo
import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'minha-api', environment: 'production' });

// NestJS
import { OtelModule } from '@haocruz/opentelemetry/nestjs';
import { configureApp } from '@haocruz/opentelemetry/nestjs';
// Em AppModule: OtelModule.forRoot({ extraSensitiveFields: ['cpf', 'rg'] })
// Em bootstrap: configureApp(app, { corsOrigin: ['https://...'] })

// Express
import { createPinoMiddleware, createTraceMiddleware } from '@haocruz/opentelemetry/express';
app.use(createPinoMiddleware());
app.use(createTraceMiddleware());

// Identidade de usuário
import { setUser, clearUser, getUser, identifyUser } from '@haocruz/opentelemetry';
setUser({ id: 'PAC123', role: 'patient', type: 'authenticated' });

// Profile em runtime
import { resolveProfile, _resetRuntimeProfileCache } from '@haocruz/opentelemetry';
```

### `OtelConfig` (setupTracing)

| Campo | Padrão | Descrição |
|---|---|---|
| `serviceName` | — | **obrigatório** |
| `environment` | `OTEL_ENVIRONMENT \|\| 'local'` | dev / staging / production |
| `otlpEndpoint` | `http://localhost:4318` | endpoint do OTel Collector |
| `logDestination` | `LOG_DESTINATION \|\| 'both'` | `both \| signoz \| console \| none` |
| `profile` | `OTEL_PROFILE \|\| 'minimal'` | `minimal \| standard \| verbose` |
| `debug` | `false` | logs diagnóstico OTel |
| `metricExportIntervalMs` | `30000` | intervalo de export de métricas |
| `disabledInstrumentations` | `[]` | ex: `['fs', 'net', 'dns']` |

### `OtelModuleConfig` (OtelModule.forRoot)

```typescript
OtelModule.forRoot({
  destination: 'both',            // roteamento de logs
  level: 'info',                  // nível Pino
  extraSensitiveFields: ['cpf'],  // adicionados aos defaults
  extraRedactPaths: ['body.token'],
  extraAllowedHeaders: ['x-user-id'],
  extraExposedHeaders: ['x-custom'],
  disableInterceptor: false,      // desabilita OtelInterceptor
})
```

---

## Pacote Web (`packages/web`)

**npm:** `@haocruz/opentelemetry-web`

Fornece tracing para browser/Electron com detecção de dispositivo, propagação de baggage e identidade.

```typescript
import { initTracing, setUser, setCurrentRoute } from '@haocruz/opentelemetry-web';

initTracing({
  serviceName: 'totem-client',
  otlpEndpoint: 'http://localhost:4318/v1/traces',
  apiUrls: ['https://api.haoc.com.br'],  // URLs que recebem traceparent
  profile: 'minimal',
  platform: 'electron',                  // 'web' | 'electron'
});

setUser({ id: 'PAC123', type: 'authenticated' });
setCurrentRoute('schedule', '/agenda');
```

**`OtelWebConfig`** — principais campos: `serviceName`, `otlpEndpoint`, `environment`, `apiUrls`, `profile`, `platform`, `ignoreUrls`.

---

## Pacote Laravel (`packages/laravel`)

**composer:** `haoc/opentelemetry-laravel`

Fornece tracing e logs estruturados para Laravel 11+.

### Estrutura interna

```
src/
├── OpenTelemetryServiceProvider.php  ← ServiceProvider — registra TracerProvider, LoggerProvider
├── Middleware/
│   └── TraceRequest.php              ← middleware HTTP principal (tracing + logs)
├── Logging/
│   └── OtelHandler.php               ← Monolog handler para OTLP
├── Attributes/
│   └── SemanticAttributes.php        ← constantes PHP (espelho do semantic-attributes.ts)
├── Profile/                          ← resolução de profile
└── Profile.php                       ← entidade Profile
```

**Config:** `config/otel.php` (chaves: `service_name`, `environment`, `endpoint`, `profile`, `sensitive_fields`, `capture_request_body`, `capture_response_body`, `log_destination`, `log_payload_mode`)

**Provider registrado em** `bootstrap/providers.php`:
```php
Haoc\OpenTelemetry\OpenTelemetryServiceProvider::class,
```

**Middleware registrado em** `bootstrap/app.php`:
```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->prepend(\Haoc\OpenTelemetry\Middleware\TraceRequest::class);
})
```

---

## Atributos Semânticos

Constantes definidas em `packages/node/src/core/semantic-attributes.ts` (TypeScript) e `packages/laravel/src/Attributes/SemanticAttributes.php` (PHP). **Sempre usar as constantes, nunca strings cruas.**

### Atributos HTTP (OTel semconv atual)

| Constante TS | Constante PHP | Valor |
|---|---|---|
| `ATTR_HTTP_REQUEST_METHOD` | `HTTP_REQUEST_METHOD` | `http.request.method` |
| `ATTR_HTTP_RESPONSE_STATUS_CODE` | `HTTP_RESPONSE_STATUS_CODE` | `http.response.status_code` |
| `ATTR_HTTP_ROUTE` | `HTTP_ROUTE` | `http.route` |
| `ATTR_URL_PATH` | `URL_PATH` | `url.path` |
| `ATTR_USER_AGENT_ORIGINAL` | `USER_AGENT_ORIGINAL` | `user_agent.original` |

### Atributos customizados (log + span)

| Constante TS | Constante PHP | Valor | Descrição |
|---|---|---|---|
| `ATTR_OTEL_PROFILE` | `OTEL_PROFILE` | `otel.profile` | Profile ativo |
| `ATTR_LOG_EVENT` | `LOG_EVENT` | `log.event` | Tipo do evento de log |
| `ATTR_LOG_TITLE` | `LOG_TITLE` | `log.title` | Título legível do log (indexável no SigNoz) |
| `ATTR_REQUEST_JSON` | `REQUEST_JSON` | `request.json` | Payload do request como JSON string |
| `ATTR_RESPONSE_JSON` | `RESPONSE_JSON` | `response.json` | Payload do response como JSON string |
| `ATTR_ERROR_JSON` | `ERROR_JSON` | `error.json` | Payload do erro como JSON string |
| `ATTR_HTTP_IS_PREFLIGHT` | `HTTP_IS_PREFLIGHT` | `http.is_preflight` | Flag de OPTIONS preflight |

### Valores de `log.event`

```typescript
LOG_EVENT_REQUEST   = 'http.request'
LOG_EVENT_RESPONSE  = 'http.response'
LOG_EVENT_ERROR     = 'http.error'
LOG_EVENT_PREFLIGHT = 'http.preflight'
```

### Atributos de identidade de usuário

| Constante TS | Valor | Descrição |
|---|---|---|
| `USER_ATTR` | `user.id` | ID do usuário |
| `USER_ROLE_ATTR` | `user.role` | Role do usuário |
| `USER_TYPE_ATTR` | `user.type` | `authenticated \| anonymous \| service` |

---

## Aliases Deprecados (`HAOC_` prefix)

Todos os identificadores com prefixo `HAOC_`/`Haoc` foram renomeados para nomes genéricos. Os aliases antigos ainda existem com `@deprecated` para retrocompatibilidade. **Novos códigos devem usar os nomes sem prefixo.**

| Deprecated | Atual |
|---|---|
| `ATTR_HAOC_PROFILE` | `ATTR_OTEL_PROFILE` |
| `ATTR_HAOC_LOG_EVENT` | `ATTR_LOG_EVENT` |
| `ATTR_HAOC_LOG_TITLE` | `ATTR_LOG_TITLE` |
| `HaocLogEvent` | `LogEvent` |
| `HaocUserIdentity` | `UserIdentity` |
| `HaocUserType` | `UserType` |
| `HaocTelemetryConfig` | `OtelConfig` |
| `HaocAppOptions` | `AppOptions` |
| `HaocLoggerModule` | `OtelModule` |
| `bootstrapHaocApp()` | `setupTracing()` + `configureApp()` |
| `HAOC_DIRECT_EMIT_ATTR` | `OTEL_DIRECT_EMIT_ATTR` |
| PHP: `HAOC_PROFILE` | `OTEL_PROFILE` |
| PHP: `HaocOpenTelemetryServiceProvider` | `OpenTelemetryServiceProvider` |
| PHP: config `haoc-otel.*` | `otel.*` |

---

## Profiles de Observabilidade

Controlam granularidade dos dados capturados. Definido via `OTEL_PROFILE` ou programaticamente.

| Comportamento | `minimal` | `standard` | `verbose` |
|---|:---:|:---:|:---:|
| Spans HTTP básicos | ✅ | ✅ | ✅ |
| Query/path params no span | ✅ | ✅ | ✅ |
| Body do request (flattenado) | ❌ | ✅ | ✅ |
| Body do response (flattenado) | ❌ | ✅ | ✅ |
| Log de request/response (sem body) | ✅ | ✅ | ✅ |
| Log com body | ❌ | ✅ | ✅ |
| Instrumentações extras (mysql, redis) | ❌ | ✅ | ✅ |
| Instrumentações fs/net/dns | ❌ | ❌ | ✅ |
| Sample ratio (produção) | 0.2 | 1.0 | 1.0 |
| **Uso indicado** | **produção** | staging/debug | dev local |

Redação de dados sensíveis é **sempre ativa**, independente do profile.

---

## Roteamento de Logs (`logDestination`)

| Valor | Comportamento |
|---|---|
| `both` | Console (pino-pretty) **+** SigNoz via OTLP (padrão) |
| `signoz` | Somente SigNoz |
| `console` | Somente console |
| `none` | Nenhum log emitido |

Controlado por `LOG_DESTINATION` (env) ou `logDestination` no config.

---

## Mecanismo de `log.title`

**Node (pino):** `buildLoggerConfig()` inclui `hooks.logMethod` que injeta automaticamente `log.title` com o texto da mensagem em toda chamada `logger.info/debug/warn/error`. Aplica-se a NestJS e Express (ambos usam `buildLoggerConfig`).

**Laravel:** `OtelHandler::write()` injeta `log.title = $record->message` quando o contexto não definiu explicitamente o atributo.

Resultado: todo log de aplicação é pesquisável por `log.title` no SigNoz sem que o chamador precise setar o campo.

---

## GatedLogExporter (deduplicação)

O SDK OTel e o `@opentelemetry/instrumentation-pino` emitem duplicatas para logs com `log.event`. O `GatedLogExporter` filtra:

- **Mantém** registros que chegaram via `otelEmit()` (marcados com `otel.direct_emit: true`)
- **Descarta** registros com `log.event` que vieram via instrumentação automática do pino
- **Remove** o atributo interno `otel.direct_emit` antes de encaminhar ao exporter real

---

## Runtime Config (mudança de profile sem restart)

### Node.js
```typescript
process.env.OTEL_PROFILE = 'standard';
process.env.OTEL_CAPTURE_BODY = 'true';
const resolved = resolveProfile();
process.env.OTEL_RESOLVED_PROFILE = JSON.stringify(resolved);
_resetRuntimeProfileCache();
// próxima request já usa o novo profile
```

### Laravel
- `RuntimeConfigMiddleware` lê `/tmp/haoc-runtime-config.json` em cada request
- Chama `Config::set('otel.profile', ...)` + `app()->forgetInstance(Profile::class)`
- `Profile` é `bind` (transient), não singleton — re-resolvido a cada request

---

## Dados Sensíveis — Redação Automática

**Campos sempre redactados** (substituídos por `[REDACTED]`):
`password`, `senha`, `secret`, `token`, `access_token`, `refresh_token`, `authorization`, `db_password`, `network_password`, `tasy_password`

**Node:** `DEFAULT_SENSITIVE_FIELDS` em `utils/sanitize.ts` + campos extras via `extraSensitiveFields`

**Laravel:** `PayloadSanitizer::DEFAULT_SENSITIVE_FIELDS` + `otel.sensitive_fields` no config

Redação ocorre em duas camadas: no flatten do body para span (span attrs) e no path do pino (`redact` config).

---

## Flatten de Payload (Notação de Ponto)

Objetos JSON são recursivamente achatados em atributos dot-notation para pesquisa no SigNoz.

```json
{ "patient": { "name": "João", "cpf": "123..." }, "amount": 99.9 }
```
→
```
body.patient.name   = "João"
body.patient.cpf    = "[REDACTED]"
body.amount         = 99.9   (number, coluna attributes_number no ClickHouse)
```

Função: `flattenToSpan()` (span attrs) e `flattenToRecord()` (log attrs).

---

## Propagação de Contexto (W3C Baggage)

O frontend (`@haocruz/opentelemetry-web`) publica baggage em cada request HTTP:

| Chave de bagagem | Origem |
|---|---|
| `page.route` | `setCurrentRoute()` |
| `page.url` | URL atual |
| `browser.name` | detecção automática |
| `device.type` | detecção automática |
| `app.platform` | `initTracing({ platform })` |
| `user.id` | `setUser()` |

Os backends (NestJS via `OtelInterceptor`, Laravel via `TraceRequest`) leem essa bagagem e a adicionam como atributos do span.

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `OTEL_SERVICE_NAME` | — | fallback para `serviceName` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | endpoint do collector |
| `OTEL_ENVIRONMENT` | `local` | ambiente |
| `OTEL_PROFILE` | `minimal` | profile de observabilidade |
| `OTEL_DEBUG` | `false` | diagnóstico OTel |
| `LOG_DESTINATION` | `both` | roteamento de logs |
| `LOG_LEVEL` | `debug`(dev) / `info`(prod) | nível Pino |
| `NODE_ENV` | — | `production` ativa JSON stdout no pino |

---

## Stack de Observabilidade (Playground)

```
apps (NestJS :3010, Express :3020, Laravel :8085, Web :5173)
      ↓ OTLP/HTTP :4318
OTel Collector (docker: signoz-otel-collector)
      ↓
SigNoz UI (:3301) → ClickHouse (:9000)
```

Consultas ClickHouse:
```sql
SELECT attributes_string['log.title'], attributes_string['log.event'], body
FROM signoz_logs.logs_v2
WHERE resources_string['service.name'] = 'playground-nestjs'
  AND timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE) * 1000000000
ORDER BY timestamp DESC LIMIT 10 FORMAT Vertical
```

---

## Convenções de Código

- **TypeScript:** todos os identificadores públicos sem prefixo `HAOC_`/`Haoc`; aliases `@deprecated` mantidos para retrocompatibilidade
- **PHP:** constantes `SemanticAttributes::LOG_TITLE`, `::LOG_EVENT` etc. (sem prefixo); aliases `@deprecated` via `self::` mantidos
- **Nunca usar strings cruas** para nomes de atributos — sempre usar constantes de `semantic-attributes.ts` ou `SemanticAttributes.php`
- **`setupTracing()` deve ser a primeira linha** do entry point Node.js (antes de qualquer import que possa usar OTel)
- **Logs de aplicação** usam `this.logger.info(obj, msg)` — `log.title` é preenchido automaticamente
