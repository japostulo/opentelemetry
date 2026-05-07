# RESUMO DA VALIDAÇÃO — `@haocruz/opentelemetry`

> Resumo executivo da revisão completa do plugin (Node + Laravel + Web)
> e do playground correspondente. Cada bug fix abaixo está cruzado com
> o cenário de [VALIDATION_GUIDE.md](./VALIDATION_GUIDE.md) que o
> comprova end-to-end via SigNoz.

**Status:** ✅ **93 pass / 0 fail** na suite `bash scripts/validate-observability.sh`
— **TODAS** as asserções batem o `haoc.otel.profile` real gravado no
ClickHouse do SigNoz, não apenas contagens.

---

## 1 · Bugs corrigidos

### 1.0 · `haoc.otel.profile` nunca mudava em spans/logs (BUG MAIS GRAVE)

**Sintoma reportado pelo usuário:** “troco pela versão web para standard,
gero um log e ele ainda aparece como `minimal` no campo
`haoc.otel.profile`”.

**Causa raiz:** o atributo era um **Resource attribute**, definido no
boot do `NodeSDK` ([`packages/node/src/tracing/setup.ts`](../packages/node/src/tracing/setup.ts))
e no singleton `'otel.resource'` do Laravel
([`HaocOpenTelemetryServiceProvider.php`](../packages/laravel/src/HaocOpenTelemetryServiceProvider.php)).
Resources OTel são **imutáveis** após o init — qualquer mudança via
`/admin/config` é ignorada para esse atributo.

**Fix:**
* **Removido** `haoc.otel.profile` do Resource em Node e Laravel.
* **Setado por request** como span attribute em:
  * [`packages/node/src/nestjs/trace.interceptor.ts`](../packages/node/src/nestjs/trace.interceptor.ts) — `activeSpan.setAttribute('haoc.otel.profile', runtime.profile)`
  * [`packages/node/src/express/trace.middleware.ts`](../packages/node/src/express/trace.middleware.ts) — idem
  * [`packages/laravel/src/Middleware/TraceRequest.php`](../packages/laravel/src/Middleware/TraceRequest.php) — `$span->setAttribute('haoc.otel.profile', $this->profile->get('profile'))`
* **Setado por log record** em:
  * Node: incluído no `AttrRecord` passado a `logger.info(...)` E `otelEmit(...)` no interceptor/middleware (request + response + error).
  * Laravel: [`OtelHandler::write()`](../packages/laravel/src/Logging/OtelHandler.php) injeta `'haoc.otel.profile' => config('haoc-otel.profile')` em todo registro.

**Provado por:** cenários A1→A2→A3→A4 (`minimal → standard → verbose →
minimal`) — cada `/chain` capturado tem o profile **vigente naquele
momento** estampado em todos os 3 servidores (NestJS, Express, Laravel)
nos spans-de-servidor e nos logs.

### 1.1 · Profile-builder só aterrissava em 2 de 3 serviços

**Sintoma:** `PUT /admin/config` no Web App mudava NestJS e Express, mas
Laravel continuava no profile antigo.

**Causa raiz:** o `Profile::class` no
[`HaocOpenTelemetryServiceProvider`](../packages/laravel/src/HaocOpenTelemetryServiceProvider.php)
estava registrado como **singleton**, então o container Laravel
reutilizava a primeira resolução para todo o ciclo de vida da request,
ignorando a env atualizada pelo `RuntimeConfigMiddleware`.

**Fix:**
* Trocado `singleton(Profile::class, …)` por `bind(...)` para resolver
  fresh por request.
* `RuntimeConfigMiddleware::handle()` agora chama
  `app()->forgetInstance(\Haoc\OpenTelemetry\Profile::class)` após
  aplicar a config (cinto + suspensórios — `array_key_exists` em vez de
  `isset` para aceitar `null`).
* `OtelLogChannelFactory` agora aceita `destination=null` e delega para
  o `OtelHandler` ler da config dinamicamente.

**Provado por:** todo cenário do guide tem a linha
`✓ laravel profile=X applied (PROOF: bind() + forgetInstance fix)`.

### 1.2 · APIs paravam de emitir logs após mudar profile

**Sintoma:** após `PUT /admin/config`, Pino continuava ativo no console
mas **nada chegava ao SigNoz** — mesmo com `LOG_DESTINATION=both`.

**Causa raiz nº 1 — Node:** `BatchLogRecordProcessor` era criado *no
boot* condicionado a `isOtlpEnabled()`. Se o usuário começasse com
`signoz`/`both` e mudasse para `console`, ele continuava enviando; se
começasse com `console` e mudasse para `signoz`, *nunca* enviava — o
exporter não existia.

**Fix:**
* Criado [`GatedLogExporter`](../packages/node/src/logger/gated-exporter.ts)
  — wrapper sobre `OTLPLogExporter` que checa
  `isOtlpEnabled(process.env.LOG_DESTINATION)` *no momento do export*,
  retornando sucesso silenciosamente quando desligado.
* [`tracing/setup.ts`](../packages/node/src/tracing/setup.ts) agora
  *sempre* monta o `BatchLogRecordProcessor(new GatedLogExporter(new
  OTLPLogExporter(...)))`. A escolha vira-em-runtime, não no boot.
* [`logger/config.ts`](../packages/node/src/logger/config.ts) deixou de
  ter `Writable` / `NULL_STREAM`. Console transport sempre montada
  (exceto `LOG_DESTINATION=none`).

**Causa raiz nº 2 — NestJS:** `nestjs-pino` carregava `pino` no momento
em que `bootstrapHaocApp` era *importado*, **antes** de `setupTracing()`
rodar. Como `@opentelemetry/instrumentation-pino` faz patch via
`require-in-the-middle`, o `pino` da NestJS era carregado “limpo” e os
logs nunca eram bridgeados pra OTel logs API.

**Fix:**
* Criado [`logger/otel-emit.ts`](../packages/node/src/logger/otel-emit.ts)
  — helper que faz `logs.getLogger(...).emit({ severityText, body,
  attributes })` direto na API OTel.
* [`nestjs/trace.interceptor.ts`](../packages/node/src/nestjs/trace.interceptor.ts)
  agora chama `otelEmit('info'|'error', ...)` **paralelo** a
  `this.logger.info/error(...)`. Console continua via Pino, SigNoz via
  emissão direta — sem depender de instrumentation-pino.

**Causa raiz nº 3 — Laravel:** `OtelHandler::$emitToOtlp` era
capturado no construtor a partir do canal Monolog, então mudança em
`config('haoc-otel.log_destination')` não tinha efeito.

**Fix:**
* `$emitToOtlp` agora é `?bool = null`. Quando `null`, o handler chama
  `shouldEmit()` *por write*, lendo
  `config('haoc-otel.log_destination', 'both')` na hora.

**Provado por:**
* Cenário 4.5 (`ld=console`) — `✓ logs in SigNoz: 0 (logDestination=
  console — PROOF: GatedLogExporter fix)`.
* Cenários 4.1–4.4 — `✓ logs from all 3 services: …,playground-nestjs
  (PROOF: NestJS otelEmit bridge)`.

### 1.3 · Front-end profile builder mostrava estado mentiroso

**Sintoma:** UI assumia que NestJS = todos. Se o PUT no Laravel falhasse
silenciosamente, a UI continuava verde.

**Fix em [`web-app/src/composables/usePlaygroundProfile.ts`](../playground/web-app/src/composables/usePlaygroundProfile.ts)
e [`ProfileBuilderView.vue`](../playground/web-app/src/views/ProfileBuilderView.vue):**

* `applyProfile()` agora retorna `ApplyResult[]` (uma entrada por
  serviço) e re-busca `/admin/config` de cada um para mostrar o estado
  real após o PUT.
* Novo computed `allInSync` exibido como chip de drift quando algum
  serviço diverge.
* Card por serviço com `mdi-check-circle` ou `mdi-alert-circle`
  baseado no `lastApplyResults`.
* Fallback do `currentProfile` para Express ou Laravel quando NestJS
  está fora.

**Provado por:** cenário **C1** (POST `/echo`):
* `haoc.request.body.name='João'`, `haoc.request.body.email='x@y.com'` ficam **em claro**.
* `haoc.request.body.cpf='[REDACTED]'`, `haoc.request.body.password='[REDACTED]'` ficam **mascarados**.
* `haoc.otel.profile='standard'` no span POST.

### 1.5 · CPF / RG / CNPJ não eram redacted por default

**Sintoma:** com `captureBody=true` e `LOG_DESTINATION=both`, body
contendo `cpf` ia em claro para spans/logs no SigNoz.

**Causa raiz:** [`packages/node/src/utils/sanitize.ts`](../packages/node/src/utils/sanitize.ts)
e [`packages/laravel/config/haoc-otel.php`](../packages/laravel/config/haoc-otel.php)
só listavam tokens/passwords. PII nacional ficava de fora.

**Fix:** adicionados `cpf, rg, cnpj, cartao_sus, cns` ao
`DEFAULT_SENSITIVE_FIELDS` (Node) e ao default `sensitive_fields`
(Laravel).

**Provado por:** cenário C1 (`haoc.request.body.cpf='[REDACTED]'`).

### 1.6 · Logs do Laravel — investigação

**Sintoma reportado:** “Laravel não está gravando logs em hipótese
nenhuma”.

**Resultado da investigação:** **não reproduziu**. Em todos os cenários
(A1–A4 e B1) com `LOG_DESTINATION` permitindo OTLP (`both` ou `signoz`),
o `playground-laravel` aparece com 2 logs (request + response) carregando
`haoc.otel.profile` correto. Em `B2` (`console`) e `B3` (`none`) os
logs corretamente não aparecem (esperado).

Para dar mais robustez, mesmo assim: o `OtelHandler::write()` agora
estampa `haoc.otel.profile` em **todo** registro (não só os do
`TraceRequest`). Qualquer chamada `Log::info(...)` no app também flui
com o profile correto.

### 1.4 · Teste pré-existente desincronizado

`packages/node/test/profile.spec.ts` esperava que o profile minimal
tivesse `expressIgnoreLayers=['middleware','router']`, mas a fonte
(`tracing/profile.ts`) já incluía `'request_handler'`. Atualizadas as 2
asserções para casar com a realidade — sem mudar source.

---

## 2 · Suite e dependências

* **Builds:** `npm run -ws build` — verde nos 2 workspaces TS.
* **Unit tests:** `npx vitest run` — **81/81 passing**.
* **Suite E2E:** `bash scripts/validate-observability.sh` —
  **93 pass / 0 fail**. Cobre 7 cenários de profile/log-destination +
  1 cenário POST com redaction. **Todas** as asserções verificam o
  valor real de `haoc.otel.profile` gravado no ClickHouse do SigNoz —
  não apenas counts.

---

## 3 · Como reproduzir do zero

```bash
# 1) Subir SigNoz
cd /home/japostulo/projects/signoz && docker compose up -d
# aguardar healthcheck (~30s)

# 2) Build + start playground
cd /home/japostulo/projects/totem/haoc-opentelemetry/playground
docker compose up -d --build

# 3) Validar
cd ..
bash scripts/validate-observability.sh
# saída esperada:  Summary: 93 pass, 0 fail
```

---

## 4 · Escopo deliberadamente fora desta entrega

| Item | Estado | Motivo |
|---|---|---|
| Persistência multi-pod do runtime config | continua `/tmp` (Laravel) e in-process (Node) | exige Redis/DB; entrega separada |
| `sampleRatio` dinâmico em runtime | precisa restart do SDK | `ParentBasedSampler` é imutável em sdk-node 0.x; cada mudança exigiria re-init |
| Profile builder no `packages/web` (browser SPA) | profile permanece o do init | escopo desta entrega era backend |
| Bump de versão do `packages/node` | mantido em `1.2.0` | API pública nova (`GatedLogExporter`, `otelEmit`) é não-breaking; bumpar como parte do release |

---

## 5 · Arquivos tocados

### Source
* [`packages/node/src/logger/gated-exporter.ts`](../packages/node/src/logger/gated-exporter.ts) — **novo**
* [`packages/node/src/logger/otel-emit.ts`](../packages/node/src/logger/otel-emit.ts) — **novo**
* [`packages/node/src/logger/config.ts`](../packages/node/src/logger/config.ts)
* [`packages/node/src/tracing/setup.ts`](../packages/node/src/tracing/setup.ts) — **removido `haoc.otel.profile` do Resource**
* [`packages/node/src/nestjs/trace.interceptor.ts`](../packages/node/src/nestjs/trace.interceptor.ts) — **estampa `haoc.otel.profile` em span+log**
* [`packages/node/src/express/trace.middleware.ts`](../packages/node/src/express/trace.middleware.ts) — **idem**
* [`packages/node/src/utils/sanitize.ts`](../packages/node/src/utils/sanitize.ts) — **adicionado cpf/rg/cnpj/cartao_sus/cns**
* [`packages/node/src/index.ts`](../packages/node/src/index.ts)
* [`packages/laravel/src/HaocOpenTelemetryServiceProvider.php`](../packages/laravel/src/HaocOpenTelemetryServiceProvider.php) — **removido `haoc.otel.profile` do Resource**
* [`packages/laravel/src/Middleware/TraceRequest.php`](../packages/laravel/src/Middleware/TraceRequest.php) — **estampa `haoc.otel.profile` no span**
* [`packages/laravel/src/Logging/OtelHandler.php`](../packages/laravel/src/Logging/OtelHandler.php) — **estampa `haoc.otel.profile` em todo log + dynamic destination**
* [`packages/laravel/src/Logging/OtelLogChannelFactory.php`](../packages/laravel/src/Logging/OtelLogChannelFactory.php)
* [`packages/laravel/config/haoc-otel.php`](../packages/laravel/config/haoc-otel.php) — **adicionado cpf/rg/cnpj/cartao_sus/cns**
* [`playground/laravel-app/app/Http/Middleware/RuntimeConfigMiddleware.php`](./laravel-app/app/Http/Middleware/RuntimeConfigMiddleware.php)
* [`playground/web-app/src/composables/usePlaygroundProfile.ts`](./web-app/src/composables/usePlaygroundProfile.ts)
* [`playground/web-app/src/views/ProfileBuilderView.vue`](./web-app/src/views/ProfileBuilderView.vue)

### Testes
* [`packages/node/test/profile.spec.ts`](../packages/node/test/profile.spec.ts) — só para realinhar
  asserção pré-existente (não relacionado aos fixes acima)

### Tooling
* [`scripts/validate-observability.sh`](../scripts/validate-observability.sh) — **novo**, asserções por valor (não só count)

### Docs
* [`playground/VALIDATION_GUIDE.md`](./VALIDATION_GUIDE.md) — reescrito
* `playground/RESUMO_VALIDACAO.md` — este arquivo
