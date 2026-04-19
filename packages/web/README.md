# @haocruz/opentelemetry-web

Biblioteca de observabilidade padronizada do HAOC para frontends web — tracing distribuído, detecção de browser/dispositivo, identidade de usuário e propagação de contexto via W3C Baggage.

## Características

- **Setup em 1 chamada** — `initTracing({ serviceName: 'meu-app' })`
- **Instrumentação automática** — Fetch, XMLHttpRequest e DocumentLoad
- **Detecção de browser/dispositivo** — nome, versão, OS, tipo (desktop/mobile/tablet), plataforma (web/electron)
- **Page tracking** — URL, rota e título da página em cada span
- **User identity** — `haoc.user.id`, `haoc.user.role`, `haoc.user.type` consistentes com o backend
- **W3C Baggage propagation** — contexto do frontend (página, browser, device, user) enviado para o backend automaticamente
- **Error tracking** — handlers globais (`window.onerror`, `unhandledrejection`) + handler Vue
- **Batteries-included** — todas as dependências OTel estão embarcadas na lib

## Instalação

```bash
npm install @haocruz/opentelemetry-web
```

Todas as dependências do OpenTelemetry para web já estão embarcadas. Não é necessário instalar `@opentelemetry/*` separadamente.

## Uso Básico

### 1. Inicializar tracing (antes de criar o app)

```typescript
// main.ts — PRIMEIRA LINHA
import { initTracing } from '@haocruz/opentelemetry-web';

initTracing({
  serviceName: 'totem-client',
  otlpEndpoint: 'http://signoz.haoc.net:4318/v1/traces',
  environment: 'production',
  propagateTraceUrls: [
    /https?:\/\/api\.totem\.haoc/,
    'http://localhost:3002',
  ],
});
```

### 2. Integrar com Vue Router (page tracking)

```typescript
import { setCurrentRoute } from '@haocruz/opentelemetry-web';
import router from './router';

router.afterEach((to) => {
  setCurrentRoute(String(to.name ?? ''), to.path);
});
```

### 3. Integrar com Vue Error Handler

```typescript
import { createVueErrorHandler } from '@haocruz/opentelemetry-web';

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
```

### 4. Identificar o usuário (após login)

```typescript
import { setUser, clearUser } from '@haocruz/opentelemetry-web';

// Após login
setUser({ id: 'PAC12345', role: 'patient', type: 'authenticated' });

// Após logout
clearUser();
```

## Exemplo Completo (Vue 3)

```typescript
// main.ts
import { initTracing } from '@haocruz/opentelemetry-web';

initTracing({
  serviceName: 'totem-client',
  otlpEndpoint: import.meta.env.VITE_OTEL_EXPORTER_ENDPOINT,
  environment: import.meta.env.VITE_APP_ENV || 'local',
  propagateTraceUrls: [
    new RegExp(import.meta.env.VITE_API_BASE_URL?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? ''),
  ],
});

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { setCurrentRoute, createVueErrorHandler } from '@haocruz/opentelemetry-web';

router.afterEach((to) => {
  setCurrentRoute(String(to.name ?? ''), to.path);
});

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
app.use(router).mount('#app');
```

## API Reference

### `initTracing(config: HaocWebConfig): WebTracerProvider`

Inicializa o OpenTelemetry para web. Deve ser chamada **antes** de criar o app.

| Opção | Tipo | Default | Descrição |
|---|---|---|---|
| `serviceName` | `string` | *(obrigatório)* | Nome do serviço no SigNoz |
| `otlpEndpoint` | `string` | `http://localhost:4318/v1/traces` | Endpoint do OTLP collector |
| `environment` | `string` | `local` | Ambiente (local/dev/prod) |
| `propagateTraceUrls` | `(string\|RegExp)[]` | `[]` | URLs para propagar headers de trace (CORS) |
| `platform` | `AppPlatform` | auto-detect | Plataforma: `web-browser`, `electron` |
| `enableErrorTracking` | `boolean` | `true` | Instalar handlers globais de erro |
| `enableDocumentLoad` | `boolean` | `true` | Instrumentar DocumentLoad |
| `additionalResourceAttributes` | `Record<string, string>` | — | Atributos extras no resource |

### `setCurrentRoute(routeName: string, routePath: string): void`

Atualiza a rota atual. Todos os spans criados após a chamada terão `page.route` e `page.path`.

### `setUser(identity: HaocUserIdentity): void`

Define o usuário autenticado. Propaga `haoc.user.id` em spans e baggage.

### `clearUser(): void`

Remove o usuário (ex: logout).

### `getUser(): HaocUserIdentity | null`

Retorna o usuário atual.

### `createVueErrorHandler(): (err, instance, info) => void`

Cria um error handler para Vue que registra spans de erro no OpenTelemetry.

### `installErrorHandlers(): void`

Instala handlers globais para `window.onerror` e `unhandledrejection`. Chamado automaticamente pelo `initTracing()`.

### `detectBrowserInfo(platform?: AppPlatform): BrowserInfo`

Detecta informações do browser, OS e dispositivo a partir do User-Agent.

## Atributos Capturados

### Em cada span (via HaocSpanProcessor)

| Atributo | Exemplo | Descrição |
|---|---|---|
| `page.url` | `/totem/agenda` | URL da página |
| `page.title` | `Agenda - Totem` | Título da página |
| `page.route` | `schedule-today` | Nome da rota (Vue Router) |
| `page.path` | `/totem/agenda/hoje` | Path da rota |
| `browser.name` | `Chrome` | Nome do browser |
| `browser.version` | `120.0.6099.130` | Versão do browser |
| `os.name` | `Windows` | Sistema operacional |
| `device.type` | `desktop` | Tipo: desktop/mobile/tablet |
| `app.platform` | `electron` | Plataforma: electron/web-browser |
| `haoc.user.id` | `PAC12345` | ID do usuário autenticado |
| `haoc.user.type` | `authenticated` | Tipo: authenticated/anonymous |
| `haoc.user.role` | `patient` | Role do usuário |

### Propagados via W3C Baggage (para o backend)

O `HaocSpanProcessor` injeta automaticamente no cabeçalho `baggage` HTTP:

- `page.route`, `page.url`
- `browser.name`, `device.type`, `app.platform`
- `haoc.user.id`

O backend (@haocruz/opentelemetry ou haoc/opentelemetry-laravel) extrai esses valores e adiciona nos spans do servidor.

## Docker / Vite

Para desenvolvimento local com Docker e Vite:

```yaml
# docker-compose.yml
services:
  node:
    volumes:
      - .:/app
      - ../haoc-opentelemetry/packages/web:/app/node_modules/@haocruz/opentelemetry-web
    networks:
      - app
      - signoz

networks:
  signoz:
    name: signoz-shared
    external: true
```

## Variáveis de Ambiente (Vite)

| Variável | Descrição |
|---|---|
| `VITE_OTEL_EXPORTER_ENDPOINT` | Endpoint do OTLP exporter |
| `VITE_APP_ENV` | Ambiente (local/dev/prod) |
| `VITE_API_BASE_URL` | URL da API para propagação de trace |
