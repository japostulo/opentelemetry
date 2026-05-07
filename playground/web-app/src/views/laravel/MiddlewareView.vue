<script setup lang="ts">
import ConfigTable from '../../components/ConfigTable.vue';
import CodeBlock from '../../components/CodeBlock.vue';

const capturedAttrs = [
  { name: 'http.method', type: 'string', description: 'Método HTTP (GET, POST, etc.)' },
  { name: 'http.url', type: 'string', description: 'URL completa da request' },
  { name: 'http.route', type: 'string', description: 'Rota Laravel registrada (ex: api/users/{id})' },
  { name: 'http.status_code', type: 'int', description: 'Status code da response' },
  { name: 'http.duration_ms', type: 'float', description: 'Duração em ms' },
  { name: 'environment', type: 'string', description: 'OTEL_ENVIRONMENT ou APP_ENV' },
  { name: 'body.*', type: 'string', description: 'Request body flattenado (se captureBody=true)' },
  { name: 'response.*', type: 'string', description: 'Response body flattenado (se captureResponse=true)' },
  { name: 'error.message', type: 'string', description: 'Exception message (se erro)' },
  { name: 'error.type', type: 'string', description: 'Classe da exception' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">TraceRequest Middleware</h1>
    <v-chip size="small" color="red-darken-1" variant="flat" class="mb-4">Laravel</v-chip>

    <p class="text-body-1 mb-6">
      Middleware HTTP que cria spans OpenTelemetry para cada request.
      Captura atributos HTTP, request/response body, propaga contexto W3C e registra erros.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Classe</h2>
    <v-card variant="outlined" class="mb-4 pa-4">
      <code class="text-h6 text-primary">Haoc\OpenTelemetry\Middleware\TraceRequest</code>
      <p class="text-body-2 mt-2">Arquivo: <code>packages/laravel/src/Middleware/TraceRequest.php</code></p>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Fluxo de Execução</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <v-timeline density="compact" side="end">
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>1. Extrai contexto W3C</strong> — Lê <code>traceparent</code> e <code>baggage</code> do request header</div>
        </v-timeline-item>
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>2. Cria span</strong> — Tracer::spanBuilder com nome da rota</div>
        </v-timeline-item>
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>3. Resolve profile</strong> — Lê config + env overrides via haocOtelProfile()</div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>4. Captura request body</strong> — Se <code>captureBody=true</code> e <code>$request->isJson()</code>, flatten para atributos</div>
        </v-timeline-item>
        <v-timeline-item dot-color="amber" size="small">
          <div class="text-body-2"><strong>5. Executa handler</strong> — <code>$next($request)</code></div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>6. Captura response body</strong> — Se <code>captureResponse=true</code> e Content-Type JSON, flatten <code>$response->getContent()</code></div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>7. Seta atributos finais</strong> — status_code, duration_ms, environment</div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>8. Log estruturado</strong> — Laravel Log::info com atributos no contexto</div>
        </v-timeline-item>
        <v-timeline-item dot-color="red" size="small">
          <div class="text-body-2"><strong>9. Trata erros</strong> — try/catch seta error.message, error.type, StatusCode::STATUS_ERROR, recordException</div>
        </v-timeline-item>
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>10. End span</strong> — <code>$span->end()</code> e detach do scope</div>
        </v-timeline-item>
      </v-timeline>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Atributos Capturados</h2>
    <ConfigTable :items="capturedAttrs" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Sanitização de Body</h2>
    <p class="text-body-2 mb-3">
      Campos sensíveis definidos em <code>config/haoc-otel.php → sensitive_fields</code> são substituídos por <code>[REDACTED]</code>
      tanto no request body quanto no response body.
    </p>
    <CodeBlock language="php" title="config/haoc-otel.php" :code="`'sensitive_fields' => [
    'password', 'token', 'access_token', 'secret',
    'authorization', 'db_password', 'tasy_password',
    'cpf', 'rg',
],`" />

    <h2 class="text-h5 font-weight-bold mb-3 mt-4">Response Body Capture</h2>
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      <strong>Limite:</strong> Response body capture é limitado a <strong>10 KB</strong> para evitar spans excessivamente grandes.
      Apenas responses com Content-Type <code>application/json</code> são capturados.
    </v-alert>
    <CodeBlock language="php" :code="`// Trecho do TraceRequest middleware
const MAX_RESPONSE_BODY_SIZE = 10 * 1024; // 10 KB

\$content = \$response->getContent();
if (strlen(\$content) <= self::MAX_RESPONSE_BODY_SIZE) {
    \$decoded = json_decode(\$content, true);
    if (is_array(\$decoded)) {
        \$sanitized = \$this->sanitizeBody(\$decoded, \$sensitiveFields);
        \$this->flattenAttributes('response', \$sanitized, \$span);
    }
}`" />
  </div>
</template>
