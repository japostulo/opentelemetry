import type { TestScenario } from '../components/TestScenarioTable.vue';

const echoBody = JSON.stringify({
  name: 'Test User',
  password: 'secret123',
  cpf: '12345678900',
  token: 'my-secret-token',
  message: 'Hello from playground!',
});

export const requestBodyScenarios: TestScenario[] = [
  {
    id: 'A1', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM body.* no span — minimal não captura request body',
    signozValidation: 'Traces → filtrar serviceName=playground-nestjs → span POST /echo → Tags: NÃO deve ter atributos body.*',
  },
  {
    id: 'A2', app: 'NestJS', profile: 'standard', endpoint: 'http://localhost:3010/echo',
    method: 'POST', body: echoBody,
    expected: 'body.name=Test User, body.password=[REDACTED], body.cpf=[REDACTED], body.token=[REDACTED], body.message presente',
    signozValidation: 'Tags → deve ter body.name="Test User", body.password="[REDACTED]", body.cpf="[REDACTED]", body.message="Hello from playground!"',
  },
  {
    id: 'A3', app: 'NestJS', profile: 'minimal', envOverride: 'OTEL_CAPTURE_BODY=true',
    endpoint: 'http://localhost:3010/echo', method: 'POST', body: echoBody,
    expected: 'body.* presente (env override > profile)',
    signozValidation: 'Tags → body.* presente mesmo com profile minimal — env var tem precedência',
  },
  {
    id: 'A4', app: 'NestJS', profile: 'standard', envOverride: 'OTEL_CAPTURE_BODY=false',
    endpoint: 'http://localhost:3010/echo', method: 'POST', body: echoBody,
    expected: 'SEM body.* (env override > profile)',
    signozValidation: 'Tags → SEM body.* mesmo com standard — env var false tem precedência',
  },
  {
    id: 'A5', app: 'Express', profile: 'minimal', endpoint: 'http://localhost:3020/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM body.* no span',
    signozValidation: 'Traces → filtrar serviceName=playground-express → span POST /echo → Tags: SEM body.*',
  },
  {
    id: 'A6', app: 'Express', profile: 'standard', endpoint: 'http://localhost:3020/echo',
    method: 'POST', body: echoBody,
    expected: 'body.* presente com campos sensíveis redatados',
    signozValidation: 'Tags → body.name="Test User", body.password="[REDACTED]"',
  },
  {
    id: 'A7', app: 'Express', profile: 'minimal', envOverride: 'OTEL_CAPTURE_BODY=true',
    endpoint: 'http://localhost:3020/echo', method: 'POST', body: echoBody,
    expected: 'body.* presente (env override)',
    signozValidation: 'Tags → body.* presente com env override',
  },
  {
    id: 'A8', app: 'Laravel', profile: 'minimal', endpoint: 'http://localhost:8085/api/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM body.* no span',
    signozValidation: 'Traces → filtrar serviceName=playground-laravel → span POST /api/echo → Tags: SEM body.*',
  },
  {
    id: 'A9', app: 'Laravel', profile: 'standard', endpoint: 'http://localhost:8085/api/echo',
    method: 'POST', body: echoBody,
    expected: 'body.* presente com campos sensíveis sanitizados',
    signozValidation: 'Tags → body.name="Test User", body.password="[REDACTED]"',
  },
  {
    id: 'A10', app: 'Laravel', profile: 'minimal', envOverride: 'OTEL_CAPTURE_BODY=true',
    endpoint: 'http://localhost:8085/api/echo', method: 'POST', body: echoBody,
    expected: 'body.* presente (env override)',
    signozValidation: 'Tags → body.* presente com env override',
  },
  {
    id: 'A11', app: 'Laravel', profile: 'standard', envOverride: 'OTEL_CAPTURE_BODY=false',
    endpoint: 'http://localhost:8085/api/echo', method: 'POST', body: echoBody,
    expected: 'SEM body.* (env override)',
    signozValidation: 'Tags → SEM body.* — env false sobreescreve standard',
  },
];

export const responseBodyScenarios: TestScenario[] = [
  {
    id: 'B1', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM response.* no span',
    signozValidation: 'Tags → NÃO deve ter atributos response.*',
  },
  {
    id: 'B2', app: 'NestJS', profile: 'standard', endpoint: 'http://localhost:3010/echo',
    method: 'POST', body: echoBody,
    expected: 'response.* flattenado — response.name, response.password=[REDACTED], response.message',
    signozValidation: 'Tags → response.name="Test User", response.password="[REDACTED]", response.message presente',
  },
  {
    id: 'B3', app: 'NestJS', profile: 'minimal', envOverride: 'OTEL_CAPTURE_RESPONSE=true',
    endpoint: 'http://localhost:3010/echo', method: 'POST', body: echoBody,
    expected: 'response.* presente (env override)',
    signozValidation: 'Tags → response.* presente com env override',
  },
  {
    id: 'B4', app: 'Express', profile: 'minimal', endpoint: 'http://localhost:3020/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM response.* no span',
    signozValidation: 'Tags → SEM response.*',
  },
  {
    id: 'B5', app: 'Express', profile: 'standard', endpoint: 'http://localhost:3020/echo',
    method: 'POST', body: echoBody,
    expected: 'response.* flattenado com redação',
    signozValidation: 'Tags → response.* presente com campos sensíveis redatados',
  },
  {
    id: 'B6', app: 'Express', profile: 'minimal', envOverride: 'OTEL_CAPTURE_RESPONSE=true',
    endpoint: 'http://localhost:3020/echo', method: 'POST', body: echoBody,
    expected: 'response.* presente (env override)',
    signozValidation: 'Tags → response.* presente com env override',
  },
  {
    id: 'B7', app: 'Laravel', profile: 'minimal', endpoint: 'http://localhost:8085/api/echo',
    method: 'POST', body: echoBody,
    expected: 'SEM response.* no span',
    signozValidation: 'Tags → SEM response.*',
  },
  {
    id: 'B8', app: 'Laravel', profile: 'standard', endpoint: 'http://localhost:8085/api/echo',
    method: 'POST', body: echoBody,
    expected: 'response.* flattenado com sanitização',
    signozValidation: 'Tags → response.* presente com campos sensíveis sanitizados',
  },
];

export const logDestinationScenarios: TestScenario[] = [
  {
    id: 'C1', app: 'NestJS', profile: 'minimal', envOverride: 'LOG_DESTINATION=both',
    endpoint: 'http://localhost:3010/hello',
    expected: 'Logs no stdout E no SigNoz',
    signozValidation: '1) docker logs playground-nestjs-app-1 → deve ter log da request. 2) SigNoz → Logs → filtrar serviceName=playground-nestjs → deve ter log',
  },
  {
    id: 'C2', app: 'NestJS', profile: 'minimal', envOverride: 'LOG_DESTINATION=console',
    endpoint: 'http://localhost:3010/hello',
    expected: 'Logs APENAS no stdout, NÃO no SigNoz',
    signozValidation: '1) docker logs → deve ter log. 2) SigNoz → Logs → NÃO deve ter log após o timestamp da request',
  },
  {
    id: 'C3', app: 'NestJS', profile: 'minimal', envOverride: 'LOG_DESTINATION=signoz',
    endpoint: 'http://localhost:3010/hello',
    expected: 'Logs APENAS no SigNoz, SEM stdout',
    signozValidation: '1) docker logs → SEM log da request (pino escreve em /dev/null). 2) SigNoz → Logs → deve ter log',
  },
  {
    id: 'C4', app: 'NestJS', profile: 'minimal', envOverride: 'LOG_DESTINATION=none',
    endpoint: 'http://localhost:3010/hello',
    expected: 'SEM logs em nenhum lugar',
    signozValidation: '1) docker logs → SEM log. 2) SigNoz → Logs → SEM log',
  },
  {
    id: 'C5', app: 'Express', profile: 'minimal', envOverride: 'LOG_DESTINATION=both',
    endpoint: 'http://localhost:3020/hello',
    expected: 'Logs no stdout E no SigNoz',
    signozValidation: 'docker logs + SigNoz Logs → ambos com log',
  },
  {
    id: 'C6', app: 'Express', profile: 'minimal', envOverride: 'LOG_DESTINATION=console',
    endpoint: 'http://localhost:3020/hello',
    expected: 'Logs APENAS stdout',
    signozValidation: 'docker logs OK, SigNoz Logs vazio',
  },
  {
    id: 'C7', app: 'Express', profile: 'minimal', envOverride: 'LOG_DESTINATION=signoz',
    endpoint: 'http://localhost:3020/hello',
    expected: 'Logs APENAS SigNoz',
    signozValidation: 'docker logs vazio, SigNoz Logs OK',
  },
  {
    id: 'C8', app: 'Express', profile: 'minimal', envOverride: 'LOG_DESTINATION=none',
    endpoint: 'http://localhost:3020/hello',
    expected: 'SEM logs',
    signozValidation: 'Ambos vazios',
  },
  {
    id: 'C9', app: 'Laravel', profile: 'minimal', envOverride: 'LOG_DESTINATION=both',
    endpoint: 'http://localhost:8085/api/hello',
    expected: 'Logs em stderr E no SigNoz',
    signozValidation: 'docker logs + SigNoz Logs → ambos com log',
  },
  {
    id: 'C10', app: 'Laravel', profile: 'minimal', envOverride: 'LOG_DESTINATION=console',
    endpoint: 'http://localhost:8085/api/hello',
    expected: 'Logs APENAS em stderr (stack só tem canal stderr)',
    signozValidation: 'docker logs OK, SigNoz Logs vazio. Stack dinâmico remove canal otel.',
  },
  {
    id: 'C11', app: 'Laravel', profile: 'minimal', envOverride: 'LOG_DESTINATION=signoz',
    endpoint: 'http://localhost:8085/api/hello',
    expected: 'Logs APENAS no SigNoz (stack só tem canal otel)',
    signozValidation: 'docker logs SEM log da request, SigNoz Logs OK. Stack dinâmico remove canal stderr.',
  },
  {
    id: 'C12', app: 'Laravel', profile: 'minimal', envOverride: 'LOG_DESTINATION=none',
    endpoint: 'http://localhost:8085/api/hello',
    expected: 'SEM logs (stack vazio)',
    signozValidation: 'Ambos vazios. Stack com array vazio de channels.',
  },
];

export const distributedTraceScenarios: TestScenario[] = [
  {
    id: 'D1', app: 'Web', profile: 'minimal', endpoint: 'http://localhost:3010/hello',
    expected: 'Trace com 2+ spans: web-fetch + nestjs-handler, mesmo traceId',
    signozValidation: 'Traces → encontrar trace mais recente → flamegraph deve mostrar span do playground-web (fetch) e span do playground-nestjs (handler) sob o mesmo traceId',
  },
  {
    id: 'D2', app: 'Web', profile: 'minimal', endpoint: 'http://localhost:3010/chain',
    expected: 'Full chain: 4+ spans (web → nestjs → express → laravel)',
    signozValidation: 'Traces → flamegraph deve mostrar cascata de 4 services: playground-web → playground-nestjs → playground-express → playground-laravel',
  },
  {
    id: 'D3', app: 'Web', profile: 'minimal', endpoint: 'http://localhost:3010/chain-laravel',
    expected: '3+ spans: web → nestjs → laravel',
    signozValidation: 'Flamegraph: playground-web → playground-nestjs → playground-laravel (sem Express no meio)',
  },
  {
    id: 'D4', app: 'Web', profile: 'minimal', endpoint: 'http://localhost:3010/chain-error',
    expected: 'Chain com erro: Express retorna 500, NestJS retorna 502, spans com status ERROR',
    signozValidation: 'Flamegraph → span Express com status ERROR (500), span NestJS com ERROR (502). Filtrar traces: hasError=true',
  },
];

export const errorScenarios: TestScenario[] = [
  {
    id: 'E1', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/error-4xx',
    expected: 'Span com http.status_code=400, span status OK (4xx não é ERROR no OTel)',
    signozValidation: 'Tags → http.status_code=400. Span status pode ser ERROR (definido pelo interceptor para >=400)',
  },
  {
    id: 'E2', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/error-5xx',
    expected: 'Span com status ERROR, error.message, error.type, exception event',
    signozValidation: 'Span → statusCode=ERROR, Tags: error.message, error.type. Events → deve ter exception event com stack trace',
  },
  {
    id: 'E3', app: 'Express', profile: 'minimal', endpoint: 'http://localhost:3020/error-5xx',
    expected: 'Span com status ERROR, http.status_code=500',
    signozValidation: 'Tags → http.status_code=500, span status ERROR',
  },
  {
    id: 'E4', app: 'Laravel', profile: 'minimal', endpoint: 'http://localhost:8085/api/error-4xx',
    expected: 'Span com status ERROR (Laravel seta ERROR para >=400)',
    signozValidation: 'Tags → http.status_code=400, span status ERROR',
  },
  {
    id: 'E5', app: 'Laravel', profile: 'minimal', endpoint: 'http://localhost:8085/api/error-5xx',
    expected: 'Span ERROR + error.message + error.type + exception recorded',
    signozValidation: 'Tags → error.message (RuntimeException), error.type. Exception event com stack trace',
  },
  {
    id: 'E6', app: 'Web', profile: 'minimal', endpoint: '#js-error',
    expected: 'Span de erro capturado pelo createVueErrorHandler() no frontend',
    signozValidation: 'Traces → filtrar serviceName=playground-web → deve ter span com error=true e mensagem do erro JS',
  },
];

export const redactionScenarios: TestScenario[] = [
  {
    id: 'F1', app: 'NestJS', profile: 'standard', endpoint: 'http://localhost:3010/echo',
    method: 'POST', body: echoBody,
    expected: 'body.password=[REDACTED], body.token=[REDACTED], body.cpf=[REDACTED], body.name=Test User (não sensível)',
    signozValidation: 'Tags → verificar que body.password, body.token, body.cpf são "[REDACTED]" e body.name, body.message estão em texto limpo',
  },
  {
    id: 'F2', app: 'Express', profile: 'standard', endpoint: 'http://localhost:3020/echo',
    method: 'POST', body: echoBody,
    expected: 'Mesma redação que NestJS',
    signozValidation: 'Tags → mesmos campos redatados que F1',
  },
  {
    id: 'F3', app: 'Laravel', profile: 'standard', endpoint: 'http://localhost:8085/api/echo',
    method: 'POST', body: echoBody,
    expected: 'body.password=[REDACTED], body.token=[REDACTED] (sensitive_fields do config)',
    signozValidation: 'Tags → verificar redação conforme sensitive_fields em haoc-otel.php',
  },
  {
    id: 'F4', app: 'NestJS', profile: 'standard', endpoint: 'http://localhost:3010/echo',
    method: 'POST',
    body: JSON.stringify({
      user: { name: 'Test', password: 'secret', data: { token: 'hidden', info: 'visible' } },
    }),
    expected: 'Nested: body.user.password=[REDACTED], body.user.data.token=[REDACTED], body.user.name=Test, body.user.data.info=visible',
    signozValidation: 'Tags → verificar redação em profundidade: user.password e user.data.token redatados, user.name e user.data.info em texto limpo',
  },
];

export const identityBaggageScenarios: TestScenario[] = [
  // ── Forma 1: via header (guard/middleware extrai e chama identifyUser) ────
  {
    id: 'G1', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/secured/profile',
    method: 'GET' as const,
    headers: { 'x-user-id': 'usr_42', 'x-user-role': 'admin' },
    expected: 'Forma 1 (guard + header) → user.id=usr_42, user.role=admin, user.type=authenticated',
    signozValidation: 'Traces → serviceName=playground-nestjs → span GET /secured/profile → Tags: user.id=usr_42, user.role=admin, user.type=authenticated',
  },
  {
    id: 'G2', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/secured/profile',
    expected: 'Forma 1 — sem header → 401 Unauthorized. Span sem user.*',
    signozValidation: 'Span GET /secured/profile → http.status_code=401. Tags: user.id ausente.',
  },
  // ── Forma 2: auth interna (backend chama identifyUser() diretamente) ──────
  {
    id: 'G3', app: 'NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/identity',
    method: 'GET' as const,
    expected: 'Forma 2 (auth interna) → user.id=usr_demo_123, user.role=operator no span',
    signozValidation: 'Traces → serviceName=playground-nestjs → span GET /identity → Tags: user.id=usr_demo_123, user.role=operator, user.type=authenticated',
  },
  {
    id: 'G4', app: 'Express', profile: 'minimal', endpoint: 'http://localhost:3020/secured/profile',
    method: 'GET' as const,
    headers: { 'x-user-id': 'usr_99', 'x-user-role': 'operator' },
    expected: 'Forma 1 (middleware + header) → user.id=usr_99, user.role=operator',
    signozValidation: 'Traces → serviceName=playground-express → span GET /secured/profile → Tags: user.id=usr_99, user.role=operator',
  },
  {
    id: 'G5', app: 'Express', profile: 'minimal', endpoint: 'http://localhost:3020/identity',
    method: 'GET' as const,
    expected: 'Forma 2 (auth interna Express) → user.id no span',
    signozValidation: 'Traces → serviceName=playground-express → span GET /identity → Tags: user.id presente',
  },
  // ── Baggage ───────────────────────────────────────────────────────────────
  {
    id: 'H1', app: 'Web → NestJS', profile: 'minimal', endpoint: 'http://localhost:3010/hello',
    expected: 'Baggage propagado: page.*, browser.*, device.* no span do NestJS',
    signozValidation: 'Span do playground-nestjs → Tags → deve ter page.url, browser.name, device.type propagados do frontend via W3C Baggage',
  },
  {
    id: 'H2', app: 'Web → NestJS → Laravel', profile: 'minimal', endpoint: 'http://localhost:3010/chain-laravel',
    expected: 'Baggage propagado até o Laravel',
    signozValidation: 'Span do playground-laravel → Tags → deve ter page.*, browser.* propagados do frontend via NestJS',
  },
];
