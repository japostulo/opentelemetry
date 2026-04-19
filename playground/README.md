# HAOC OpenTelemetry — Playground

Playground Docker self-contained para testar as 3 libs publicadas do monorepo `@haocruz/opentelemetry`:

| App | Lib testada | Porta | Stack |
|-----|------------|-------|-------|
| **nestjs-app** | `@haocruz/opentelemetry` + `/nestjs` | 3010 | NestJS 10 |
| **express-app** | `@haocruz/opentelemetry` + `/express` | 3020 | Express 4 |
| **laravel-app** | `haoc/opentelemetry-laravel` | 8085 | Laravel 11 + PHP 8.2 |
| **web-app** | `@haocruz/opentelemetry-web` | 8090 | Vue 3 + Vite |

## Pré-requisitos

- Docker + Docker Compose
- SigNoz rodando no host (porta 4318 para OTLP HTTP)

## Como rodar

```bash
cd playground
docker compose up --build
```

## Endpoints

### NestJS (`:3010`)
| Método | Rota | O que testa |
|--------|------|-------------|
| GET | `/hello` | Tracing básico + log automático |
| GET | `/chain` | Distributed tracing NestJS → Express → Laravel |
| POST | `/echo` | Flatten de body + redação de campos sensíveis |
| GET | `/identity` | Módulo de identidade (setUser/getUser) |

### Express (`:3020`)
| Método | Rota | O que testa |
|--------|------|-------------|
| GET | `/hello` | createTraceMiddleware + createPinoMiddleware |
| GET | `/chain` | Cross-tech tracing Node → PHP |
| POST | `/echo` | Body handling + redação |

### Laravel (`:8085`)
| Método | Rota | O que testa |
|--------|------|-------------|
| GET | `/api/hello` | TraceRequest middleware + OtelHandler |
| POST | `/api/echo` | Body flatten + redação de campos sensíveis |

### Web / Vue (`:8090`)
UI com botões que chamam as APIs acima e demonstram:
- `initTracing()` — WebTracerProvider + auto-instrumentation
- `createVueErrorHandler()` — error spans
- Propagação de contexto (traceparent/baggage) via fetch

## Cadeia de distributed tracing

```
Browser (Web) → NestJS (:3010/chain) → Express (:3020/hello) → Laravel (:8085/api/hello)
```

Um único clique no botão **"Full Chain"** gera 1 trace com spans dos 4 serviços.

## O que validar no SigNoz

Acesse http://localhost:3301 e verifique:

1. **Traces** — cada request aparece com o service name correto
2. **Distributed Tracing** — o endpoint `/chain` gera trace com múltiplos services
3. **Redação** — POST no `/echo` com `{"password":"secret","cpf":"123"}` → campos aparecem como `[REDACTED]` nos span attributes
4. **Identity** — `GET /identity` gera span attributes `haoc.user.*`
5. **Web Errors** — botão "Trigger Error" gera span `unhandled-error`
6. **Logs** — logs estruturados (Pino) correlacionados com traceId

## Teste rápido via curl

```bash
# Serviços individuais
curl http://localhost:3010/hello
curl http://localhost:3020/hello
curl http://localhost:8085/api/hello

# Distributed tracing
curl http://localhost:3010/chain

# Redação de campos sensíveis
curl -X POST http://localhost:3010/echo \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","password":"secret123","cpf":"12345678900"}'

# Identity
curl http://localhost:3010/identity
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Traces não aparecem no SigNoz | Verifique se SigNoz está rodando: `curl http://localhost:4318/v1/traces` |
| Container falha no build | Rode `docker compose build --no-cache` |
| Porta em uso | Altere as portas no `docker-compose.yml` |
| Laravel 500 | Verifique logs: `docker compose logs laravel-app` |

## Arquitetura

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│ Web/Vue │────▶│ NestJS  │────▶│ Express  │────▶│ Laravel │
│  :8090  │     │  :3010  │     │  :3020   │     │  :8085  │
└────┬────┘     └────┬────┘     └────┬─────┘     └────┬────┘
     │               │               │                │
     └───────────────┴───────────────┴────────────────┘
                            │
                   OTLP HTTP (:4318)
                            │
                     ┌──────▼──────┐
                     │   SigNoz    │
                     │   :3301     │
                     └─────────────┘
```
