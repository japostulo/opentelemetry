# Runtime Config — Alteração de Profile Sem Restart

## O Que é Runtime Config

A lib suporta alteração do profile de observabilidade **sem reiniciar o processo**. A mudança afeta a próxima requisição recebida.

Isso funciona porque o interceptor/middleware **re-lê o profile a cada request** via `getRuntimeProfile()`, que consulta variáveis de processo em tempo real.

---

## Como Funciona (Node.js)

### Mecanismo interno

```
PUT /admin/config { profile: "standard" }
       │
       ▼
process.env.HAOC_OTEL_PROFILE = "standard"
process.env.HAOC_OTEL_RESOLVED_PROFILE = JSON.stringify(resolveProfile())
_resetRuntimeProfileCache()        ← invalida cache in-memory
       │
       ▼
Próxima request → getRuntimeProfile() lê env var atualizado
```

**Dois níveis de cache:**

1. `_runtimeCache` (in-memory, por processo): invalidado por `_resetRuntimeProfileCache()` a cada PUT
2. `process.env.HAOC_OTEL_RESOLVED_PROFILE`: string JSON serializada do profile resolvido, lida como fallback quando o cache in-memory é null

Não há warmup, restart ou reload necessário.

### API pública para alteração

```typescript
import { resolveProfile, _resetRuntimeProfileCache } from '@haocruz/opentelemetry';

// Muta o env var:
process.env.HAOC_OTEL_PROFILE = 'standard';
process.env.HAOC_OTEL_CAPTURE_BODY = 'true';

// Re-resolve e serializa:
const resolved = resolveProfile();
process.env.HAOC_OTEL_RESOLVED_PROFILE = JSON.stringify(resolved);

// Invalida o cache in-memory:
_resetRuntimeProfileCache();
```

---

## Como Funciona (Laravel)

### Mecanismo interno

O Laravel usa um arquivo de configuração runtime em `/tmp/haoc-runtime-config.json`:

```
PUT /api/admin/config { profile: "standard" }
       │
       ▼
RuntimeConfigMiddleware::save($config)  ← escreve /tmp/haoc-runtime-config.json
       │
       ▼
Próxima request → RuntimeConfigMiddleware::handle()
  lê o arquivo
  Config::set('haoc-otel.profile', ...)
  app()->forgetInstance(Profile::class)   ← descarta singleton, Profile é re-resolvido
       │
       ▼
TraceRequest::__construct(TracerInterface $tracer, Profile $profile)
  Profile é construído fresh pelo container IoC a cada request
```

**Por que funciona sem restart:**
- `Profile` está registrado como `bind` (transient), não como `singleton`
- `RuntimeConfigMiddleware` roda **antes** de `TraceRequest` na pilha de middlewares
- `app()->forgetInstance()` garante que o container não usa instância em cache

---

## Endpoints do Playground

Todos os serviços do playground expõem endpoints de admin em `/admin/config` (Node) e `/api/admin/config` (Laravel).

### `GET /admin/config`

Retorna o estado atual de configuração do serviço:

```json
{
  "service": "nestjs",
  "profile": "standard",
  "captureBody": true,
  "captureResponse": true,
  "logDestination": "both"
}
```

### `PUT /admin/config`

Altera a configuração em runtime:

```bash
curl -s -X PUT http://localhost:3010/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"profile":"standard","captureBody":true,"captureResponse":true,"logDestination":"both"}'
```

Retorna o novo estado (igual ao GET).

**Campos aceitos:**

| Campo | Tipo | Descrição |
|---|---|---|
| `profile` | `"minimal" \| "standard" \| "verbose"` | Profile a aplicar |
| `captureBody` | `boolean \| null` | Override de captura de body (null = usa padrão do profile) |
| `captureResponse` | `boolean \| null` | Override de captura de response |
| `logDestination` | `"both" \| "signoz" \| "console" \| "none"` | Destino dos logs OTLP |

---

## `logDestination` em Runtime

| Valor | Console | SigNoz (OTLP) |
|---|:---:|:---:|
| `both` | ✅ | ✅ |
| `signoz` | ❌ | ✅ |
| `console` | ✅ | ❌ |
| `none` | ❌ | ❌ |

**Node.js**: A decisão de emitir OTLP é avaliada a cada batch pelo `GatedLogExporter`, que lê `LOG_DESTINATION` em runtime. Suportado em runtime sem restart.

**Laravel**: O `OtelHandler::shouldEmit()` lê `config('haoc-otel.log_destination')` a cada `write()`. O `RuntimeConfigMiddleware` seta esse valor via `Config::set()`. Suportado em runtime sem restart.

---

## Validação Rápida via curl

### Ciclo completo minimal → standard → verbose → minimal

```bash
# 1. Aplicar minimal
curl -s -X PUT http://localhost:3010/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"profile":"minimal","captureBody":false,"captureResponse":false,"logDestination":"both"}'

# 2. Verificar
curl -s http://localhost:3010/admin/config | python3 -m json.tool

# 3. Testar request (sem body nos spans/logs)
curl -s -X POST http://localhost:3010/echo \
  -H 'Content-Type: application/json' \
  -d '{"user":{"name":"João","cpf":"12345678900"},"password":"secret"}'

# 4. Aplicar standard
curl -s -X PUT http://localhost:3010/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"profile":"standard","captureBody":true,"captureResponse":true,"logDestination":"both"}'

# 5. Verificar (deve mostrar profile=standard)
curl -s http://localhost:3010/admin/config | python3 -m json.tool

# 6. Testar request (body aparece em span e log, cpf/password redacted)
curl -s -X POST http://localhost:3010/echo \
  -H 'Content-Type: application/json' \
  -d '{"user":{"name":"João","cpf":"12345678900"},"password":"secret"}'

# 7. Aplicar verbose
curl -s -X PUT http://localhost:3010/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"profile":"verbose","captureBody":true,"captureResponse":true,"logDestination":"both"}'

# 8. Verificar
curl -s http://localhost:3010/admin/config | python3 -m json.tool

# 9. Testar cadeia completa
curl -v http://localhost:3010/chain 2>&1 | grep -E 'X-Trace-Id|traceId'

# 10. Voltar para minimal
curl -s -X PUT http://localhost:3010/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"profile":"minimal","captureBody":false,"captureResponse":false,"logDestination":"both"}'
```

Substitua `localhost:3010` por `localhost:3020` (Express) ou `localhost:8085/api` (Laravel) para testar os outros serviços.

---

## Limitações Conhecidas

### Multi-pod / Multi-instance

A configuração runtime é **por processo**. Em um cluster com N pods, você precisa fazer `PUT /admin/config` em cada pod individualmente. Não há sincronização entre instâncias.

### Persistência

- **Node.js**: a configuração é mantida em `process.env` até o processo ser reiniciado. Não há persistência em disco.
- **Laravel**: a configuração é persistida em `/tmp/haoc-runtime-config.json` no container. Sobrevive a reloads do PHP-FPM, mas não a restart do container.

### `haoc.otel.profile` no Resource vs. Attribute

O atributo `haoc.otel.profile` é estampado **por request** (no span/log), não no Resource do SDK. Se fosse no Resource, seria imutável após `setupTracing()`. A abordagem atual permite que spans de requests diferentes no mesmo processo tenham profiles diferentes, refletindo exatamente o momento da mudança.

### Instrumentações (NestJS/Express)

As instrumentações OTel (quais libs são instrumentadas) são definidas no boot do SDK via `setupTracing()` e **não mudam em runtime**. A mudança de profile em runtime afeta apenas: captura de body, logging de body, filtros de rota, e o atributo `haoc.otel.profile`.

### Laravel: SamplerProvider

O sampler do TracerProvider Laravel é configurado no `HaocOpenTelemetryServiceProvider::boot()` e é imutável após o boot. `sample_ratio` mudado via runtime não afeta o sampler em execução.
