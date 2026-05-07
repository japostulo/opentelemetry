# Convenção de Atributos — @haocruz/opentelemetry

## Visão Geral

A lib usa o namespace `haoc.*` para todos os atributos institucionais em spans e logs. Isso evita colisão com atributos semânticos do OpenTelemetry (`http.*`, `db.*`, `rpc.*`) e facilita filtros no SigNoz.

---

## Namespace `haoc.*`

| Prefixo | Destino | Descrição |
|---|---|---|
| `haoc.otel.profile` | span + log | Profile ativo no momento da requisição |
| `haoc.request.body.*` | span + log | Campos do corpo da requisição (flattenados) |
| `haoc.request.query.*` | span + log | Query params da URL |
| `haoc.request.params.*` | span + log | Path params da rota |
| `haoc.response.body.*` | span + log | Campos da resposta (flattenados) |
| `haoc.error.response.*` | span + log | Campos do erro HTTP (flattenados) |
| `haoc.user.id` | span | ID do usuário autenticado |
| `haoc.user.role` | span | Role do usuário |
| `haoc.user.type` | span | Tipo: `authenticated`, `anonymous`, `service` |

---

## Atributos HTTP Padrão (OpenTelemetry Semantic Conventions)

Esses atributos são definidos pela auto-instrumentação HTTP e pelo interceptor/middleware:

| Atributo | Descrição |
|---|---|
| `http.method` | Método HTTP (`GET`, `POST`, etc.) |
| `http.route` | Rota da requisição (`/api/v1/patients/:id`) |
| `http.status_code` | Código de status HTTP |
| `http.duration_ms` | Duração da requisição em milissegundos |
| `http.url` | URL completa (Laravel) |
| `http.target` | Path + query string (Laravel) |
| `environment` | Ambiente (`local`, `dev`, `staging`, `prod`) |

---

## Flatten de Body/Response

### Como funciona

O objeto JSON é recursivamente expandido em atributos dot-notation. Cada campo folha vira um atributo separado e pesquisável no SigNoz.

### Payload de exemplo

```json
{
  "user": {
    "name": "João",
    "email": "joao@example.com",
    "cpf": "12345678900"
  },
  "order": {
    "id": "abc-123",
    "amount": 99.9
  },
  "password": "secret"
}
```

### Atributos gerados no span (profile `standard` ou `verbose`)

```
haoc.request.body.user.name    = "João"
haoc.request.body.user.email   = "joao@example.com"
haoc.request.body.user.cpf     = "[REDACTED]"
haoc.request.body.order.id     = "abc-123"
haoc.request.body.order.amount = 99.9
haoc.request.body.password     = "[REDACTED]"
```

> `amount` é armazenado como `number` na coluna `attributes_number` do ClickHouse, não como string. Isso permite filtros numéricos no SigNoz.

### Atributos de response

```
haoc.response.body.status  = "ok"
haoc.response.body.data.id = "abc-123"
```

### Query params

```
haoc.request.query.page   = "1"
haoc.request.query.size   = "20"
haoc.request.query.filter = "active"
```

### Path params

```
haoc.request.params.id     = "abc-123"
haoc.request.params.userId = "42"
```

---

## Regras de Flatten

### Profundidade máxima

- **Node.js**: 4 níveis (configurado via `MAX_FLATTEN_DEPTH = 4`)
- **Laravel**: 3 níveis (configurado via `$depth > 3` em `flattenAttributes`)

Exemplo: `haoc.request.body.a.b.c.d` é o nível 4 — atributos mais profundos são descartados silenciosamente.

### Arrays

Arrays são serializados como string JSON no atributo pai:

```json
{ "tags": ["a", "b", "c"] }
```

→

```
haoc.request.body.tags = '["a","b","c"]'
```

Isso evita explosão de atributos (ex: `tags.0`, `tags.1`, `tags.2`, ...).

### Strings JSON

Strings que são JSON válido são expandidas recursivamente como se fossem objetos:

```json
{ "meta": "{\"version\":\"1.0\",\"source\":\"web\"}" }
```

→

```
haoc.request.body.meta.version = "1.0"
haoc.request.body.meta.source  = "web"
```

### Preservação de tipos

| Tipo PHP/JS | Coluna ClickHouse | Exemplo |
|---|---|---|
| `string` | `attributes_string` | `"João"` |
| `number` / `int` / `float` | `attributes_number` | `99.9` |
| `boolean` | `attributes_bool` | `true` |

> **Importante**: valores null e undefined são ignorados (não geram atributo).

---

## Campos Sensíveis — Redaction

Os campos abaixo são sempre substituídos por `[REDACTED]`, independente do profile ou profundidade do objeto:

| Campo | Categoria |
|---|---|
| `password`, `senha` | Credenciais |
| `token`, `access_token`, `refresh_token` | Tokens |
| `authorization`, `secret` | Autenticação |
| `db_password`, `network_password`, `tasy_password` | Senhas de sistema |
| `cpf`, `rg`, `cnpj` | PII — documentos BR |
| `cartao_sus`, `cns` | PII — saúde |

### Exemplos de redaction

```
haoc.request.body.user.cpf  = "[REDACTED]"
haoc.request.body.password  = "[REDACTED]"
haoc.request.body.user.name = "João"         ← não redacted
haoc.request.body.user.email = "joao@..."   ← não redacted (email não é sensível por padrão)
```

### Adicionando campos sensíveis customizados

```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HAOC_SENSITIVE_FIELDS, mergeSensitiveFields } from '@haocruz/opentelemetry/nestjs';

// No AppModule providers:
{
  provide: HAOC_SENSITIVE_FIELDS,
  useValue: mergeSensitiveFields(['numero_cartao', 'data_nascimento']),
}
```

---

## Pesquisa no SigNoz

### Por campo do body

```sql
-- SigNoz Logs Explorer
attributes_string['haoc.request.body.user.name'] = 'João'

-- SigNoz Trace Explorer
haoc.request.body.user.cpf = '[REDACTED]'
```

### Por profile

```sql
attributes_string['haoc.otel.profile'] = 'standard'
```

### Por trace ID com logs correlacionados

```sql
-- Traces
trace_id = 'abc123...'

-- Logs do mesmo trace
trace_id = 'abc123...'
```

### Query ClickHouse direta (debug)

```sql
-- Spans com body de uma requisição específica
SELECT
    serviceName,
    attributes_string['haoc.otel.profile'] AS profile,
    attributes_string['haoc.request.body.user.name'] AS user_name,
    attributes_string['haoc.request.body.user.cpf'] AS user_cpf,
    attributes_number['haoc.request.body.order.amount'] AS order_amount
FROM signoz_traces.signoz_index_v3
WHERE timestamp > now() - INTERVAL 5 MINUTE
  AND has(mapKeys(attributes_string), 'haoc.request.body.user.name')
LIMIT 10;
```

```sql
-- Logs com body redacted
SELECT
    timestamp,
    resources_string['service.name'] AS service,
    attributes_string['haoc.otel.profile'] AS profile,
    attributes_string['haoc.request.body.user.cpf'] AS cpf_should_be_redacted,
    body
FROM signoz_logs.distributed_logs_v2
WHERE timestamp > now() - INTERVAL 5 MINUTE
LIMIT 10;
```

---

## Atributos de Infra / Rastreamento de Hops

Populados automaticamente quando os headers correspondentes existem:

| Atributo | Header de origem |
|---|---|
| `http.forwarded_for` | `X-Forwarded-For` |
| `network.hop_count` | Contagem de IPs em `X-Forwarded-For` |
| `http.real_ip` | `X-Real-IP` |
| `http.forwarded_host` | `X-Forwarded-Host` |
| `http.forwarded_proto` | `X-Forwarded-Proto` |
| `http.via` | `Via` |

---

## Atributos de Baggage (Frontend → Backend)

O frontend (`@haocruz/opentelemetry-web`) propaga via W3C Baggage:

| Chave | Descrição |
|---|---|
| `page.route` | Rota Vue atual |
| `page.url` | URL completa do browser |
| `browser.name` | Nome do browser |
| `browser.version` | Versão do browser |
| `device.type` | `mobile`, `tablet`, `desktop` |
| `app.platform` | `web` |
| `haoc.user.id` | ID do usuário (se `setUser()` foi chamado) |

Esses valores ficam disponíveis como atributos do span no backend, facilitando a correlação frontend-backend.
