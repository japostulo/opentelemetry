# HAOC OpenTelemetry — Arquitetura e Documentação

## Visão Geral

Monorepo de bibliotecas de observabilidade padronizadas do Hospital Alemão Oswaldo Cruz (HAOC), fornecendo **tracing distribuído**, **logs estruturados**, **detecção de browser/dispositivo**, **identidade de usuário** e **propagação de contexto** para todas as aplicações do ecossistema.

### Pacotes

| Pacote | Linguagem | Target | Versão |
|---|---|---|---|
| [`@haoc/opentelemetry`](packages/node/README.md) | TypeScript | Node.js (NestJS / Express) | 1.1.0 |
| [`@haoc/opentelemetry-web`](packages/web/README.md) | TypeScript | Web (Vue / React / Electron) | 1.0.0 |
| [`haoc/opentelemetry-laravel`](packages/laravel/README.md) | PHP | Laravel 11+ | 1.0.0 |

## Diagrama de Arquitetura

```mermaid
graph TB
    subgraph Frontend ["🖥️ Frontend (Electron / Browser)"]
        VUE["Vue 3 App"]
        WEB_LIB["@haoc/opentelemetry-web"]
        VUE --> WEB_LIB
        WEB_LIB -->|"Fetch/XHR<br/>traceparent + baggage"| API_GW
    end

    subgraph Backend_Node ["⚙️ Backend Node.js (NestJS)"]
        API_GW["API Gateway<br/>NestJS"]
        NODE_LIB["@haoc/opentelemetry"]
        API_GW --> NODE_LIB
    end

    subgraph Backend_PHP ["⚙️ Backend PHP (Laravel)"]
        MGMT["Management API<br/>Laravel"]
        PHP_LIB["haoc/opentelemetry-laravel"]
        MGMT --> PHP_LIB
    end

    subgraph Observability ["📊 Observability Stack"]
        COLLECTOR["OTel Collector"]
        SIGNOZ["SigNoz<br/>(ClickHouse)"]
        COLLECTOR --> SIGNOZ
    end

    WEB_LIB -->|"OTLP/HTTP<br/>traces"| COLLECTOR
    NODE_LIB -->|"OTLP/HTTP<br/>traces + logs + metrics"| COLLECTOR
    PHP_LIB -->|"OTLP/HTTP<br/>logs"| COLLECTOR
    
    API_GW -->|HTTP| MGMT
```

## Fluxo de Dados End-to-End

```mermaid
sequenceDiagram
    participant U as 👤 Usuário
    participant F as 🖥️ Frontend<br/>(Vue/Electron)
    participant W as @haoc/opentelemetry-web
    participant N as ⚙️ API Node<br/>(NestJS)
    participant H as @haoc/opentelemetry
    participant L as 📦 API Laravel
    participant P as haoc/opentelemetry-laravel
    participant S as 📊 SigNoz

    U->>F: Abre o totem
    F->>W: initTracing()
    Note over W: Detecta browser, OS, device<br/>Instala error handlers<br/>Registra instrumentações

    U->>F: Navega para /agenda
    F->>W: setCurrentRoute('schedule', '/agenda')
    
    U->>F: Login
    F->>W: setUser({ id: 'PAC123' })

    U->>F: Busca agendamentos
    F->>N: GET /agenda?search=Maria
    Note over F,N: Headers: traceparent + baggage<br/>(page.route, browser.name,<br/>device.type, haoc.user.id)
    
    N->>H: HaocTraceInterceptor
    Note over H: Extrai baggage → span attrs<br/>Flatten query → query.search<br/>Flatten body → body.field<br/>User identity → haoc.user.id<br/>Infra headers → network.hop_count

    N->>L: HTTP (se necessário)
    Note over N,L: Propaga traceparent

    L->>P: TraceRequest middleware
    Note over P: Mesma lógica de flatten,<br/>identity e baggage

    H-->>S: OTLP traces + logs
    P-->>S: OTLP logs
    W-->>S: OTLP traces

    N-->>F: Response + X-Trace-Id
    Note over H: Flatten response → response.data.total<br/>Error → error.message, error.response.errors.name
```

## Propagação de Contexto (W3C Baggage)

```mermaid
graph LR
    subgraph Frontend
        SP["HaocSpanProcessor"]
        SP -->|"setBaggage()"| B["W3C Baggage Header"]
    end

    B -->|"HTTP Request"| INT["HaocTraceInterceptor<br/>(Node)"]
    B -->|"HTTP Request"| MW["TraceRequest<br/>(Laravel)"]

    INT -->|"getBaggage()"| SA1["Span Attributes"]
    MW -->|"getBaggage()"| SA2["Span Attributes"]

    subgraph "Baggage Entries"
        direction TB
        E1["page.route = schedule-today"]
        E2["page.url = /totem/agenda"]
        E3["browser.name = Chrome"]
        E4["device.type = desktop"]
        E5["app.platform = electron"]
        E6["haoc.user.id = PAC12345"]
    end
```

## Notação de Ponto (Flatten)

Todos os dados de request/response são achatados em notação de ponto para facilitar consultas no SigNoz:

```mermaid
graph TD
    REQ["Request Body<br/>{patient: {name: 'Maria', cpf: '123...'}}"]
    REQ --> F["flattenToSpan()"]
    F --> A1["body.patient.name = 'Maria'"]
    F --> A2["body.patient.cpf = '[REDACTED]'"]

    RES["Response<br/>{data: {items: [...], total: 42}}"]
    RES --> F2["flattenToSpan()"]
    F2 --> B1["response.data.total = 42"]
    F2 --> B2["response.data.items = '[...]'"]

    ERR["HttpException<br/>{statusCode: 400, errors: {name: 'obrigatório'}}"]
    ERR --> F3["flattenToSpan()"]
    F3 --> C1["error.message = 'Erro de validação'"]
    F3 --> C2["error.response.statusCode = 400"]
    F3 --> C3["error.response.errors.name = 'O campo nome é obrigatório'"]
```

## Identidade de Usuário

As três libs compartilham os mesmos nomes de atributo para permitir consultas consistentes no SigNoz:

| Atributo | Frontend | Node Backend | Laravel Backend |
|---|---|---|---|
| `haoc.user.id` | `setUser()` | `setUser()` + Baggage | `Auth::id()` + Baggage |
| `haoc.user.role` | `setUser()` | `setUser()` | — |
| `haoc.user.type` | `setUser()` | `setUser()` | — |

## Dados Sensíveis

Redação automática em duas camadas:

1. **Flatten** — `flattenToSpan()` / `flattenToRecord()` verificam o campo contra a lista de sensíveis antes de gravar
   - Password, senha, token, secret, access_token, refresh_token, authorization, db_password, network_password, tasy_password
   
2. **Pino Redact** (Node) — 60+ paths cobrindo patterns aninhados (`user.password`, `body.token`, etc.)

## Infraestrutura e Hops

O interceptor captura headers de proxy/load balancer para rastreamento de infraestrutura:

| Header | Atributo | Uso |
|---|---|---|
| `X-Forwarded-For` | `http.forwarded_for` | IPs na cadeia de proxies |
| `X-Real-IP` | `http.real_ip` | IP real do cliente |
| `X-Forwarded-Host` | `http.forwarded_host` | Host original |
| `X-Forwarded-Proto` | `http.forwarded_proto` | Protocolo (http/https) |
| `Via` | `http.via` | Proxies intermediários |
| (calculado) | `network.hop_count` | Quantidade de hops na cadeia |

## Estrutura do Monorepo

```
haoc-opentelemetry/
├── package.json              # Workspace root (npm workspaces)
├── Dockerfile                # Build multi-package
├── docker-compose.yml        # Build container + volumes
│
├── packages/
│   ├── node/                 # @haoc/opentelemetry
│   │   ├── src/
│   │   │   ├── index.ts              # Barrel exports (core)
│   │   │   ├── tracing/              # setupTracing(), config
│   │   │   ├── identity/             # setUser(), getUser(), constants
│   │   │   ├── logger/               # Pino config, redaction
│   │   │   ├── nestjs/               # Module, Interceptor, Bootstrap
│   │   │   │   ├── index.ts          # Barrel exports (nestjs)
│   │   │   │   ├── logger.module.ts  # HaocLoggerModule
│   │   │   │   ├── trace.interceptor.ts  # HaocTraceInterceptor
│   │   │   │   ├── bootstrap.ts      # configureHaocApp()
│   │   │   │   └── types.ts
│   │   │   ├── express/              # Middleware para Express puro
│   │   │   └── utils/                # flatten, sanitize, stringify
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── web/                  # @haoc/opentelemetry-web
│   │   ├── src/
│   │   │   ├── index.ts              # Barrel exports
│   │   │   ├── tracing.ts            # initTracing()
│   │   │   ├── processor.ts          # HaocSpanProcessor + setCurrentRoute
│   │   │   ├── identity.ts           # setUser(), getUser()
│   │   │   ├── browser.ts            # detectBrowserInfo()
│   │   │   └── errors.ts             # Error handlers + Vue handler
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── laravel/              # haoc/opentelemetry-laravel
│       ├── src/
│       │   ├── HaocOpenTelemetryServiceProvider.php
│       │   ├── Middleware/TraceRequest.php
│       │   └── Logging/
│       │       ├── OtelHandler.php
│       │       └── OtelLogChannelFactory.php
│       ├── config/haoc-otel.php
│       ├── composer.json
│       └── README.md
```

## Configuração em Docker

### API NestJS

```yaml
# api/docker-compose.yml
services:
  node:
    volumes:
      - ../haoc-opentelemetry/packages/node:/var/www/node_modules/@haoc/opentelemetry
    networks:
      - signoz
```

### Frontend Vue/Electron

```yaml
# client/docker-compose.yml
services:
  node:
    volumes:
      - ../haoc-opentelemetry/packages/web:/app/node_modules/@haoc/opentelemetry-web
    networks:
      - signoz
```

### Management Laravel

```yaml
# management/docker-compose.yml
services:
  app:
    volumes:
      - ../haoc-opentelemetry/packages/laravel:/var/www/vendor/haoc/opentelemetry-laravel
    networks:
      - signoz
```

Todas as redes `signoz` devem referenciar a rede externa `signoz-shared`:

```yaml
networks:
  signoz:
    name: signoz-shared
    external: true
```

## Setup Rápido

### 1. Build das libs

```bash
cd haoc-opentelemetry
docker compose up --build -d
```

### 2. API NestJS (2 linhas)

```typescript
// main.ts
import { setupTracing } from '@haoc/opentelemetry';
setupTracing({ serviceName: 'minha-api' });
```

```typescript
// app.module.ts
@Module({ imports: [HaocLoggerModule.forRoot()] })
export class AppModule {}
```

### 3. Frontend Vue (1 chamada)

```typescript
import { initTracing } from '@haoc/opentelemetry-web';
initTracing({ serviceName: 'meu-app', otlpEndpoint: '...' });
```

### 4. Laravel (config automático)

```bash
composer require haoc/opentelemetry-laravel
# Auto-discovery registra o service provider
```

## Consultas úteis no SigNoz

### Traces de um usuário específico

```
haoc.user.id = 'PAC12345'
```

### Requests lentos (>1s)

```
http.duration_ms > 1000
```

### Erros de validação

```
error.type = 'HttpException' AND http.status_code = 400
```

### Requests de um browser/device específico

```
browser.name = 'Chrome' AND device.type = 'desktop'
```

### Fluxo completo frontend → backend

```
page.route = 'schedule-today'
```

## Licença

MIT — Hospital Alemão Oswaldo Cruz
