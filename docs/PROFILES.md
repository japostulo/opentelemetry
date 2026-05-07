# Profiles e Configuração de Logs — @haocruz/opentelemetry

## Visão Geral

O sistema de profiles controla o nível de detalhe da observabilidade. Cada profile define valores padrão para captura de spans, body/response, instrumentações e filtros. Tudo é sobreponível via código ou variáveis de ambiente.

**Precedência de configuração:**
```
Argumento programático > Variável de ambiente (HAOC_OTEL_*) > Padrão do profile
```

---

## Matriz de Comportamento por Profile

| Comportamento | `minimal` | `standard` | `verbose` |
|---|:---:|:---:|:---:|
| Span: trace básico (method, route, status, duration) | ✅ | ✅ | ✅ |
| Span: `haoc.otel.profile` | ✅ | ✅ | ✅ |
| Span: `haoc.request.query.*` (query params) | ✅ | ✅ | ✅ |
| Span: `haoc.request.params.*` (path params) | ✅ | ✅ | ✅ |
| Span: `haoc.request.body.*` (body flattenado) | ❌ | ✅ | ✅ |
| Span: `haoc.response.body.*` (response flattenado) | ❌ | ✅ | ✅ |
| Log: request (sem body) | ✅ | ✅ | ✅ |
| Log: response (sem body) | ✅ | ✅ | ✅ |
| Log: body no request | ❌ | ✅ | ✅ |
| Log: body no response | ❌ | ✅ | ✅ |
| Redaction em campos sensíveis | ✅ | ✅ | ✅ |
| Instrumentação: pg, http, nestjs, express, pino | ✅ | ✅ | ✅ |
| Instrumentação: mysql, mongodb, redis | ❌ | ✅ | ✅ |
| Instrumentação: fs, net, dns | ❌ | ❌ | ✅ |
| `expressIgnoreLayers` | middleware+router+handler | middleware | (nenhum) |
| Sample ratio (prod) | 0.2 | 1.0 | 1.0 |
| Impacto de custo/volume | **baixo** | médio | alto |
| Indicado para | produção | staging/debug | dev local |

> Todos os campos listados como "redacted" (cpf, password, token, etc.) são **sempre** mascarados como `[REDACTED]`, independente do profile.

---

## Profiles Disponíveis

### `minimal` (padrão)

O profile recomendado para produção. Foca em spans essenciais e logs estruturados sem body.

| Configuração | Valor |
|---|---|
| `captureRequestBody` | `false` — body **não** vai para atributos do span |
| `captureResponseBody` | `false` — response **não** vai para atributos do span |
| `logRequestBody` | `false` — body **não** vai para os logs Pino |
| `logResponseBody` | `false` — response **não** vai para os logs Pino |
| `expressIgnoreLayers` | `['middleware', 'router', 'request_handler']` |
| `sampleRatio` | `1.0` (dev) / `0.2` (production automático) |
| Instrumentações ativas | `http`, `express`, `nestjs`, `pg`, `pino` |
| Instrumentações inativas | `fs`, `net`, `dns`, `mysql`, `mongodb`, `redis` |

**Comportamento dos logs:**
- **Log de request**: inclui `method`, `route`, `query`, `params` — **sem body**
- **Log de response**: inclui `method`, `route`, `status_code`, `duration_ms` — **sem response body**
- **Log de erro**: inclui tudo acima + `error.message`, `error.type`, `haoc.error.response`

> No `minimal`, nem o span nem os logs capturam body/response. É o profile mais seguro e de menor volume.

### `standard`

Ideal para ambientes de staging ou debug em produção controlado.

| Configuração | Valor |
|---|---|
| `captureRequestBody` | `true` — body **vai** para atributos do span |
| `captureResponseBody` | `true` — response **vai** para atributos do span |
| `logRequestBody` | `true` |
| `logResponseBody` | `true` |
| `expressIgnoreLayers` | `['middleware']` |
| Instrumentações adicionais | `mysql`, `mysql2`, `mongodb`, `ioredis`, `redis` |

### `verbose`

Tudo ligado. Útil apenas para debugging local.

| Configuração | Valor |
|---|---|
| `captureRequestBody` | `true` |
| `captureResponseBody` | `true` |
| `logRequestBody` | `true` |
| `logResponseBody` | `true` |
| `expressIgnoreLayers` | `[]` — mantém todos os spans do Express |
| Instrumentações adicionais | `fs`, `net`, `dns` |

---

## Diferença entre Captura no Span vs Log

| Flag | Destino | Impacto |
|---|---|---|
| `captureRequestBody` | Atributos do span OpenTelemetry | Visível no trace viewer (SigNoz/Jaeger) como atributo do span. Aumenta tamanho do trace. |
| `captureResponseBody` | Atributos do span OpenTelemetry | Idem. |
| `logRequestBody` | Log Pino (entrada JSON) | Visível nos logs estruturados (SigNoz Logs / console). Não afeta traces. |
| `logResponseBody` | Log Pino (entrada JSON) | Idem. |

**No profile `minimal`**: tanto span attributes quanto os logs ficam sem body/response. É o profile mais seguro e leve para produção.

---

## Controle Granular por Endpoint

### `logBodyIgnoreRoutes` — Suprimir body em rotas específicas

Suprime body/response nos **logs** para rotas que correspondam aos padrões. Útil para endpoints de alto tráfego ou dados binários.

```typescript
setupTracing({
  serviceName: 'minha-api',
  profile: 'minimal',
  logBodyIgnoreRoutes: [
    /^\/health$/,              // regex nativo
    '^/api/v1/upload',         // string compilada como regex (case-insensitive)
    '^/api/v1/stream',
  ],
});
```

Ou via variável de ambiente:
```bash
HAOC_OTEL_LOG_BODY_IGNORE_ROUTES=^/health$,^/api/v1/upload,^/api/v1/stream
```

### `logBodyOnlyRoutes` — Incluir body apenas em rotas específicas

Se definido (array não-vazio), **apenas** rotas correspondentes terão body/response nos logs. Todas as demais rotas geram logs sem body. **Tem precedência sobre `logBodyIgnoreRoutes`.**

```typescript
setupTracing({
  serviceName: 'minha-api',
  profile: 'minimal',
  logBodyOnlyRoutes: [
    '^/api/v1/patients',
    '^/api/v1/invoices',
  ],
});
```

Ou via variável de ambiente:
```bash
HAOC_OTEL_LOG_BODY_ONLY_ROUTES=^/api/v1/patients,^/api/v1/invoices
```

### Prioridade de Avaliação

```
1. logBodyOnlyRoutes não-vazio? → só rotas correspondentes têm body nos logs
2. logBodyIgnoreRoutes corresponde? → body suprimido para essa rota
3. Nenhum corresponde? → body incluído nos logs (padrão)
```

### `ignoreRoutes` — Suprimir logs completamente

Diferente de `logBodyIgnoreRoutes`, o `ignoreRoutes` suprime **todo** o log de request/response da rota (nem a linha de log é gerada). Use para rotas que não precisam de nenhuma observabilidade no nível do interceptor.

```typescript
setupTracing({
  serviceName: 'minha-api',
  profile: 'minimal',
  ignoreRoutes: ['^/internal/ping'],
});
```

---

## Todas as Variáveis de Ambiente

| Variável | Tipo | Descrição |
|---|---|---|
| `HAOC_OTEL_PROFILE` | `minimal\|standard\|verbose` | Profile base |
| `HAOC_OTEL_SAMPLE_RATIO` | `0.0` – `1.0` | Ratio de amostragem head-based |
| `HAOC_OTEL_IGNORE_URLS` | CSV de regex | Paths HTTP ignorados (sem span) |
| `HAOC_OTEL_IGNORE_OUTGOING_URLS` | CSV de regex | URLs outgoing ignoradas |
| `HAOC_OTEL_IGNORE_ROUTES` | CSV de regex | Rotas sem log no interceptor |
| `HAOC_OTEL_EXPRESS_IGNORE_LAYERS` | CSV | Layers Express ignorados (`middleware,router,request_handler`) |
| `HAOC_OTEL_CAPTURE_BODY` | `true\|false` | Body nos atributos do span |
| `HAOC_OTEL_CAPTURE_RESPONSE` | `true\|false` | Response nos atributos do span |
| `HAOC_OTEL_LOG_REQUEST_BODY` | `true\|false` | Body nos logs Pino |
| `HAOC_OTEL_LOG_RESPONSE_BODY` | `true\|false` | Response nos logs Pino |
| `HAOC_OTEL_LOG_BODY_IGNORE_ROUTES` | CSV de regex | Rotas sem body/response nos logs |
| `HAOC_OTEL_LOG_BODY_ONLY_ROUTES` | CSV de regex | Somente estas rotas com body nos logs |
| `HAOC_OTEL_TRACE_HTTP` | `true\|false` | Toggle instrumentação HTTP |
| `HAOC_OTEL_TRACE_EXPRESS` | `true\|false` | Toggle instrumentação Express |
| `HAOC_OTEL_TRACE_NESTJS` | `true\|false` | Toggle instrumentação NestJS |
| `HAOC_OTEL_TRACE_PG` | `true\|false` | Toggle instrumentação PostgreSQL |
| `HAOC_OTEL_TRACE_MYSQL` | `true\|false` | Toggle instrumentação MySQL |
| `HAOC_OTEL_TRACE_MONGODB` | `true\|false` | Toggle instrumentação MongoDB |
| `HAOC_OTEL_TRACE_IOREDIS` | `true\|false` | Toggle instrumentação ioredis |
| `HAOC_OTEL_TRACE_REDIS` | `true\|false` | Toggle instrumentação Redis |
| `HAOC_OTEL_TRACE_PINO` | `true\|false` | Toggle instrumentação Pino |
| `HAOC_OTEL_TRACE_FS` | `true\|false` | Toggle instrumentação FS |
| `HAOC_OTEL_TRACE_NET` | `true\|false` | Toggle instrumentação Net |
| `HAOC_OTEL_TRACE_DNS` | `true\|false` | Toggle instrumentação DNS |

---

## Exemplos de Configuração

### Minimal com body nos logs mas sem body para /health e /metrics

```typescript
setupTracing({
  serviceName: 'totem-api',
  profile: 'minimal',
  logBodyIgnoreRoutes: ['^/health$', '^/metrics$'],
});
```

### Minimal com body nos logs APENAS para rotas de paciente

```typescript
setupTracing({
  serviceName: 'totem-api',
  profile: 'minimal',
  logBodyOnlyRoutes: ['^/api/v1/patient'],
});
```

### Minimal sem body nos logs (nem span nem log)

```typescript
setupTracing({
  serviceName: 'totem-api',
  profile: 'minimal',
  logRequestBody: false,
  logResponseBody: false,
});
```

### Standard com body nos logs mas sem body no span para rotas sensíveis

```typescript
setupTracing({
  serviceName: 'totem-api',
  profile: 'standard',
  // Span attributes capturam body para todas as rotas (padrão standard)
  // Mas logs suprimem body para rotas de upload
  logBodyIgnoreRoutes: ['^/api/v1/upload'],
});
```

### Configuração 100% via variáveis de ambiente

```bash
HAOC_OTEL_PROFILE=minimal
HAOC_OTEL_SAMPLE_RATIO=0.5
HAOC_OTEL_LOG_REQUEST_BODY=true
HAOC_OTEL_LOG_RESPONSE_BODY=true
HAOC_OTEL_LOG_BODY_IGNORE_ROUTES=^/health$,^/metrics$
HAOC_OTEL_IGNORE_ROUTES=^/internal/ping$
HAOC_OTEL_EXPRESS_IGNORE_LAYERS=middleware,router,request_handler
```

---

## Configuração para Laravel (PHP)

O pacote `haoc/opentelemetry-laravel` segue a mesma nomenclatura de profiles (`minimal` / `standard` / `verbose`), mas tem suas particularidades por ser PHP/Monolog. Esta seção detalha tudo que é configurável.

### Como funciona a instrumentação no Laravel

O pacote usa dois mecanismos:

1. **`TraceRequest` middleware** — cria o span principal da request HTTP, extrai contexto W3C (`traceparent`/`baggage`) do frontend, enriquece o span com atributos e emite logs estruturados via `Log::info/warning/error`.
2. **`OtelHandler` (canal Monolog)** — encaminha todos os `Log::*()` da aplicação para o OTLP collector como OpenTelemetry Log Records, correlacionados com o trace ativo.

### O que cada profile captura no Laravel

| Configuração | `minimal` | `standard` | `verbose` |
|---|---|---|---|
| Body nos **atributos do span** | `false` | `true` | `true` |
| Response body nos **atributos do span** | `false` | `true` | `true` |
| Body nos **log entries** | Nunca¹ | Nunca¹ | Nunca¹ |
| `query` + `route params` nos logs | Sempre | Sempre | Sempre |
| `query` + `route params` no span | Sempre | Sempre | Sempre |
| Rotas ignoradas por padrão | health, up, _debugbar, telescope, horizon | idem | nenhuma |
| `sample_ratio` em produção | `0.2` (automático) | `0.2` | `1.0` |

> ¹ **Diferença importante em relação ao Node.js**: no Laravel, o body da request não é incluído nos log entries (apenas nos atributos do span quando `capture_request_body = true`). O response body nunca é capturado em logs (a response já foi enviada ao cliente quando o middleware finaliza).

**Atributos sempre presentes no log de request:**
- `http.method`, `http.route`, `query`, `params`

**Atributos sempre presentes no log de response:**
- `http.method`, `http.route`, `http.status_code`, `http.duration_ms`

**Atributos no log de erro (exceção):**
- tudo acima + `error.message`, `error.type`

### Registrando o middleware

**Laravel 11+ (bootstrap/app.php):**
```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->append(\Haoc\OpenTelemetry\Middleware\TraceRequest::class);
})
```

**Laravel 10 (app/Http/Kernel.php) — global (todas as rotas):**
```php
protected $middleware = [
    // ...
    \Haoc\OpenTelemetry\Middleware\TraceRequest::class,
];
```

**Laravel 10 (app/Http/Kernel.php) — somente grupo `api`:**
```php
protected $middlewareGroups = [
    'api' => [
        \Haoc\OpenTelemetry\Middleware\TraceRequest::class,
        // ...
    ],
];
```

> O totem/management usa o padrão do grupo `api` — apenas rotas de API são instrumentadas, sem impactar rotas web/Sanctum.

### Publicando e editando o arquivo de configuração

```bash
php artisan vendor:publish --tag=haoc-otel-config
```

Cria `config/haoc-otel.php` na aplicação. Sem publicar, os defaults do pacote são usados automaticamente.

### Arquivo `config/haoc-otel.php` — referência completa

```php
return [
    // Nome do serviço nos traces e logs (aparece no SigNoz como "Service Name")
    'service_name' => env('OTEL_SERVICE_NAME', env('APP_NAME', 'laravel')),

    // Ambiente: 'local', 'dev', 'staging', 'production'
    'environment' => env('OTEL_ENVIRONMENT', env('APP_ENV', 'local')),

    // Endpoint OTLP HTTP (traces + logs)
    'endpoint' => env('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://host.docker.internal:4318'),

    // Profile: 'minimal' (padrão) | 'standard' | 'verbose'
    'profile' => env('HAOC_OTEL_PROFILE', 'minimal'),

    // Ratio de amostragem 0..1; null = usa o padrão do profile
    // Em produção, profiles minimal/standard caem automaticamente para 0.2
    'sample_ratio' => env('HAOC_OTEL_SAMPLE_RATIO'),

    // Padrões regex (case-insensitive) de rotas a ignorar COMPLETAMENTE
    // (sem span, sem log). Mesclado com os padrões padrão do profile.
    // Via env: CSV de regex — ex: HAOC_OTEL_IGNORE_ROUTES=^api/ping$,^status$
    'ignore_routes' => array_filter(explode(',', (string) env('HAOC_OTEL_IGNORE_ROUTES', ''))),

    // Capturar body da request nos atributos do span (não afeta logs)
    // Padrão: false em minimal, true em standard/verbose
    'capture_request_body' => env('HAOC_OTEL_CAPTURE_BODY'),

    // Capturar body da response nos atributos do span (não afeta logs)
    // Padrão: false em minimal, true em standard/verbose
    'capture_response_body' => env('HAOC_OTEL_CAPTURE_RESPONSE'),

    // Destino dos logs OTel: 'both' | 'signoz' | 'console' | 'none'
    'log_destination' => env('LOG_DESTINATION', 'both'),

    // Campos redatados como '[REDACTED]' nos atributos do span
    'sensitive_fields' => [
        'password', 'senha', 'secret', 'token', 'access_token',
        'refresh_token', 'authorization', 'db_password', 'tasy_password',
    ],
];
```

### Variáveis de ambiente disponíveis

| Variável | Tipo | Descrição |
|---|---|---|
| `OTEL_SERVICE_NAME` | string | Nome do serviço (fallback: `APP_NAME`) |
| `OTEL_ENVIRONMENT` | string | Ambiente (fallback: `APP_ENV`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | Endpoint do collector OTLP |
| `HAOC_OTEL_PROFILE` | `minimal\|standard\|verbose` | Profile base |
| `HAOC_OTEL_SAMPLE_RATIO` | `0.0` – `1.0` | Ratio de amostragem |
| `HAOC_OTEL_IGNORE_ROUTES` | CSV de regex | Rotas ignoradas completamente (sem span e sem log) |
| `HAOC_OTEL_CAPTURE_BODY` | `true\|false` | Body da request nos atributos do span |
| `HAOC_OTEL_CAPTURE_RESPONSE` | `true\|false` | Body da response nos atributos do span |
| `LOG_DESTINATION` | `both\|signoz\|console\|none` | Rota dos logs Laravel via OtelHandler |
| `LOG_LEVEL` | `debug\|info\|warning\|error` | Nível mínimo de log |

### Configurando o canal de logs OTLP (Monolog)

Para que os `Log::info()`, `Log::error()` etc. apareçam no SigNoz como Log Records correlacionados ao trace, configure `config/logging.php`:

```php
'channels' => [
    'stack' => [
        'driver' => 'stack',
        // Inclua 'otlp' no stack — logs vão para arquivo E para o SigNoz
        'channels' => ['single', 'otlp'],
        'ignore_exceptions' => false,
    ],

    'otlp' => [
        'driver' => 'custom',
        'via' => \Haoc\OpenTelemetry\Logging\OtelLogChannelFactory::class,
        'level' => env('LOG_LEVEL', 'debug'),
    ],

    'single' => [
        'driver' => 'single',
        'path' => storage_path('logs/laravel.log'),
        'level' => env('LOG_LEVEL', 'debug'),
    ],
    // ...
],
```

> Com `LOG_DESTINATION=signoz`, o `OtelHandler` envia via OTLP normalmente. Com `LOG_DESTINATION=console`, ele se torna no-op (útil para não poluir o SigNoz em dev). Com `LOG_DESTINATION=both` (padrão), o stack pode ter outros channels (ex: `single`) que gravam localmente enquanto o `otlp` envia ao SigNoz.

### Profiles no Laravel — exemplos práticos

**Minimal (padrão de produção) — sem body no span:**
```bash
# .env
HAOC_OTEL_PROFILE=minimal
# Query params e route params aparecem nos spans e nos logs
# Body NÃO aparece em lugar algum (nem span, nem log)
```

**Standard — body e response nos atributos do span:**
```bash
HAOC_OTEL_PROFILE=standard
# Body da request (POST/PUT/PATCH JSON) vai para atributos do span
# Response body vai para atributos do span
# Query/params continuam sempre presentes
```

**Minimal com body no span explicitamente ativado:**
```bash
HAOC_OTEL_PROFILE=minimal
HAOC_OTEL_CAPTURE_BODY=true
HAOC_OTEL_CAPTURE_RESPONSE=true
# Equivalente ao standard, mas mantendo os outros padrões do minimal
# (rotas ignoradas incluem health/telescope/horizon etc.)
```

**Ignorar rotas específicas completamente:**
```bash
# Rotas api/ping e api/status não geram span nem log
HAOC_OTEL_IGNORE_ROUTES=^api/ping$,^api/status$
```

**Reduzir amostragem em produção:**
```bash
# Em produção, apenas 10% das traces são enviadas ao SigNoz
APP_ENV=production
HAOC_OTEL_SAMPLE_RATIO=0.1
# Obs: sem HAOC_OTEL_SAMPLE_RATIO, minimal/standard já caem para 0.2 automaticamente em produção
```

**Logs apenas no SigNoz (sem arquivo local):**
```bash
LOG_DESTINATION=signoz
# Remove o canal 'single' do stack em logging.php, ou defina LOG_CHANNEL=otlp
```

### Diferenças entre Laravel e Node.js

| Capacidade | Node.js (`@haocruz/opentelemetry`) | Laravel (`haoc/opentelemetry-laravel`) |
|---|---|---|
| Body nos **atributos do span** | `captureRequestBody` | `capture_request_body` |
| Body nos **logs** | `logRequestBody` (novo, independente) | ❌ Não disponível — body vai apenas para span |
| Response nos logs | `logResponseBody` (novo, independente) | ❌ Não disponível — response já foi enviada |
| Ignorar rotas nos logs (mas manter span) | `ignoreRoutes` | ❌ Não disponível — `ignore_routes` remove span E log |
| Body somente para certas rotas nos logs | `logBodyOnlyRoutes` | ❌ Não disponível |
| Body ignorado para certas rotas nos logs | `logBodyIgnoreRoutes` | ❌ Não disponível |
| Express layer spans | `expressIgnoreLayers` | N/A (PHP não tem esse conceito) |
| Toggle por instrumentação | `instrumentations.pg`, `instrumentations.redis`, etc. | N/A (PHP usa extensões OTel nativas) |

> As funcionalidades marcadas como ❌ são limitações arquiteturais do PHP/Monolog: no middleware PHP, o body da request pode ser capturado, mas o body da response já foi enviado ao cliente antes do middleware terminar. As flags `logRequestBody`/`logResponseBody` são exclusivas do Node.js.

---

## Sobre o span `request handler - /*`

No NestJS, o Express por baixo cria spans para cada "layer" processado: `middleware`, `router` e `request_handler`. O span `request handler - /*` aparece quando há uma rota catch-all ou quando o NestJS registra o handler raiz do Express.

A partir da v1.3.0, o profile `minimal` inclui `request_handler` na lista de `expressIgnoreLayers`, eliminando esses spans automaticamente. Para profiles anteriores ou customizados, adicione manualmente:

```typescript
setupTracing({
  serviceName: 'minha-api',
  expressIgnoreLayers: ['middleware', 'router', 'request_handler'],
});
```

Ou via variável de ambiente:
```bash
HAOC_OTEL_EXPRESS_IGNORE_LAYERS=middleware,router,request_handler
```
