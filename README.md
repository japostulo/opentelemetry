# @haocruz/opentelemetry

Biblioteca de observabilidade padronizada do HAOC para backends Node.js — tracing, métricas e logs estruturados via OpenTelemetry + Pino.

## Características

- **Setup de tracing em 1 linha** — `setupTracing({ serviceName: 'meu-servico' })`
- **Logger pré-configurado** com redação de dados sensíveis (passwords, tokens, secrets)
- **4 modos de roteamento de logs** — `both | signoz | console | none`
- **Suporte NestJS** — `HaocLoggerModule.forRoot()` configura logger + interceptor + CORS automaticamente
- **Suporte Express** — `createTraceMiddleware()`, `createPinoMiddleware()`
- **Backend agnóstico** — OTLP genérico (SigNoz, Jaeger, Grafana Tempo, etc.)
- **Batteries-included** — todas as dependências OTel/Pino estão embarcadas na lib
- **Extensível** — custom sensitive fields, redact paths, CORS headers, resource attributes

## Instalação

```bash
npm install @haocruz/opentelemetry
```

Todas as dependências de OpenTelemetry, Pino e nestjs-pino já estão embarcadas na lib. Não é necessário instalar peer dependencies adicionais para OTel/Pino.

### Para NestJS

```bash
npm install @nestjs/common @nestjs/core rxjs
```

### Para Express

```bash
npm install express
```

### Dev (pino-pretty para logs coloridos)

```bash
npm install -D pino-pretty
```

## Uso — NestJS

```typescript
// main.ts — PRIMEIRA LINHA do arquivo
import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'minha-api' });

import { NestFactory } from '@nestjs/core';
import { configureHaocApp } from '@haocruz/opentelemetry/nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configureHaocApp(app, {
    corsOrigin: ['https://meu-site.com'],
  });

  await app.listen(3000);
}
bootstrap();
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { HaocLoggerModule } from '@haocruz/opentelemetry/nestjs';

@Module({
  imports: [HaocLoggerModule.forRoot()],
})
export class AppModule {}
```

`configureHaocApp()` cuida automaticamente de:
- `app.useLogger()` — substitui o logger padrão pelo Pino
- `app.enableCors()` — configura CORS com headers de tracing (`X-Trace-Id`, `traceparent`, etc.)

O `HaocLoggerModule.forRoot()` auto-registra:
- **Logger** Pino com redação de dados sensíveis
- **`HaocTraceInterceptor`** como interceptor global (injeta `X-Trace-Id` nos responses)
- **CORS config** provider com headers de tracing padrão

## Uso — Express

```typescript
// app.ts — PRIMEIRA LINHA do arquivo
import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'minha-api-express' });

import express from 'express';
import { createPinoMiddleware, createTraceMiddleware } from '@haocruz/opentelemetry/express';

const app = express();

app.use(express.json());
app.use(createPinoMiddleware());
app.use(createTraceMiddleware());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000);
```

## Configuração

### Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Endpoint do OTel Collector |
| `OTEL_SERVICE_NAME` | — | Fallback para `serviceName` do config |
| `OTEL_ENVIRONMENT` | `local` | Ambiente (dev/staging/prod) |
| `OTEL_DEBUG` | `false` | Ativa logs de diagnóstico do OTel |
| `LOG_DESTINATION` | `both` | Rota de logs: `both\|signoz\|console\|none` |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Nível mínimo de log |
| `NODE_ENV` | — | `production` ativa JSON stdout |

### setupTracing(config)

```typescript
setupTracing({
  serviceName: 'minha-api',
  environment: 'production',              // Override OTEL_ENVIRONMENT
  otlpEndpoint: 'http://collector:4318',  // Override OTEL_EXPORTER_OTLP_ENDPOINT
  debug: false,
  logDestination: 'both',
  metricExportIntervalMs: 30000,
  disabledInstrumentations: ['express', 'fs', 'net', 'dns'],
  httpRequestHook: (span, request) => {
    span.setAttribute('custom.attr', 'value');
  },
  additionalResourceAttributes: {
    'deployment.region': 'us-east-1',
  },
});
```

### HaocLoggerModule.forRoot(config?)

```typescript
HaocLoggerModule.forRoot({
  // Configurações do Logger
  destination: 'console',
  level: 'debug',
  environment: 'local',
  extraRedactPaths: ['custom.secret.path'],
  isProduction: false,

  // Campos sensíveis extras (adicionados aos padrões)
  extraSensitiveFields: ['cpf', 'rg'],

  // CORS headers extras para tracing
  extraAllowedHeaders: ['X-Custom-Header'],
  extraExposedHeaders: ['X-Custom-Response'],

  // Desabilitar o interceptor automático (padrão: false)
  disableTraceInterceptor: false,
})
```

### configureHaocApp(app, options?)

```typescript
import { configureHaocApp } from '@haocruz/opentelemetry/nestjs';

configureHaocApp(app, {
  corsOrigin: true, // boolean | string | string[]
});
```

Configura automaticamente:
- `app.useLogger()` com o Logger Pino do módulo
- `app.enableCors()` com headers de tracing (lidos do `HAOC_CORS_CONFIG` ou defaults)

### HaocTraceInterceptor

O interceptor é registrado automaticamente pelo `HaocLoggerModule.forRoot()`. Não é necessário configurar `APP_INTERCEPTOR` manualmente.

Para desabilitar o registro automático:

```typescript
HaocLoggerModule.forRoot({ disableTraceInterceptor: true })
```

## Imports Disponíveis

```typescript
// Core — tracing, logger config, utilities
import { setupTracing, buildLoggerConfig, flattenToSpan } from '@haocruz/opentelemetry';

// NestJS — módulo, interceptor, bootstrap helper, tipos
import {
  HaocLoggerModule,
  HaocTraceInterceptor,
  configureHaocApp,
  HAOC_CORS_CONFIG,
  HAOC_SENSITIVE_FIELDS,
  PinoLogger,
} from '@haocruz/opentelemetry/nestjs';
// Tipos
import type { HaocModuleConfig, HaocAppOptions, HaocCorsConfig } from '@haocruz/opentelemetry/nestjs';

// Express — middleware
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';
```

## Dados Sensíveis (Redação Automática)

Campos automaticamente redatados como `[REDACTED]`:

- `password`, `senha`, `secret`, `token`
- `access_token`, `refresh_token`, `authorization`
- `db_password`, `network_password`, `tasy_password`

Duas camadas de proteção:
1. **Span/Log attributes** — `flattenToSpan()` / `flattenToRecord()` filtram antes de gravar
2. **Pino redact** — 60+ paths cobrindo patterns aninhados (`user.password`, `body.token`, etc.)

## Licença

MIT
