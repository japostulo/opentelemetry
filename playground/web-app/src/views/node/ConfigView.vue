<script setup lang="ts">
import ConfigTable from '../../components/ConfigTable.vue';

const envVars = [
  { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', type: 'string', default: 'http://localhost:4318', required: true, description: 'Endpoint do collector OTLP (HTTP)' },
  { name: 'OTEL_SERVICE_NAME', type: 'string', required: true, description: 'Nome do serviço no SigNoz' },
  { name: 'OTEL_ENVIRONMENT', type: 'string', default: 'local', description: 'Ambiente (local, staging, production)' },
  { name: 'HAOC_OTEL_PROFILE', type: 'string', default: 'minimal', description: 'Profile ativo: minimal | standard | verbose', envVar: 'HAOC_OTEL_PROFILE' },
  { name: 'HAOC_OTEL_CAPTURE_BODY', type: 'boolean', description: 'Override: captura request body no span', envVar: 'HAOC_OTEL_CAPTURE_BODY' },
  { name: 'HAOC_OTEL_CAPTURE_RESPONSE', type: 'boolean', description: 'Override: captura response body no span', envVar: 'HAOC_OTEL_CAPTURE_RESPONSE' },
  { name: 'HAOC_OTEL_LOG_REQUEST_BODY', type: 'boolean', description: 'Override: inclui request body nos logs Pino' },
  { name: 'HAOC_OTEL_LOG_RESPONSE_BODY', type: 'boolean', description: 'Override: inclui response body nos logs Pino' },
  { name: 'HAOC_OTEL_LOG_BODY_IGNORE_ROUTES', type: 'string (CSV)', description: 'Regex de rotas onde body NÃO é logado' },
  { name: 'HAOC_OTEL_LOG_BODY_ONLY_ROUTES', type: 'string (CSV)', description: 'Whitelist: body é logado APENAS nestas rotas' },
  { name: 'HAOC_OTEL_SAMPLE_RATIO', type: 'number (0-1)', description: 'Override do sample ratio do profile' },
  { name: 'HAOC_OTEL_IGNORE_URLS', type: 'string (CSV)', description: 'Paths HTTP ignorados pelo SDK (complementa profile)' },
  { name: 'HAOC_OTEL_IGNORE_ROUTES', type: 'string (CSV)', description: 'Rotas ignoradas pelo interceptor/middleware' },
  { name: 'LOG_DESTINATION', type: 'string', default: 'both', description: 'Destino dos logs: both | console | signoz | none' },
  { name: 'LOG_LEVEL', type: 'string', default: 'info (prod)', description: 'Nível mínimo do log: debug | info | warn | error' },
  { name: 'NODE_ENV', type: 'string', default: 'development', description: 'Afeta: pino-pretty (dev), async stdout (prod), sample ratio' },
];

const programmaticOptions = [
  { name: 'serviceName', type: 'string', required: true, description: 'Nome do serviço (usado no OTEL_SERVICE_NAME)' },
  { name: 'profile', type: "'minimal' | 'standard' | 'verbose'", default: "'minimal'", description: 'Baseline de configuração' },
  { name: 'captureRequestBody', type: 'boolean', description: 'Override do profile para captura de request body' },
  { name: 'captureResponseBody', type: 'boolean', description: 'Override do profile para captura de response body' },
  { name: 'logRequestBody', type: 'boolean', description: 'Override para body nos logs' },
  { name: 'logResponseBody', type: 'boolean', description: 'Override para response nos logs' },
  { name: 'logDestination', type: "'both' | 'console' | 'signoz' | 'none'", default: "'both'", description: 'Destino dos logs' },
  { name: 'logLevel', type: "'debug' | 'info' | 'warn' | 'error'", description: 'Nível mínimo do log' },
  { name: 'sampleRatio', type: 'number (0-1)', description: 'Head-based sampling ratio' },
  { name: 'extraSensitiveFields', type: 'Iterable<string>', description: 'Campos sensíveis adicionais (merge com defaults)' },
  { name: 'ignoreRoutes', type: 'string[]', description: 'Regex de rotas ignoradas pelo interceptor' },
  { name: 'extraRedactPaths', type: 'string[]', description: 'Paths adicionais para Pino redact' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Configuration</h1>
    <p class="text-body-1 mb-6">
      Referência completa de variáveis de ambiente e opções programáticas.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Precedência:</strong> Argumento programático &gt; Variável de ambiente &gt; Default do profile
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">Variáveis de Ambiente</h2>
    <ConfigTable :items="envVars" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Opções Programáticas (HaocTelemetryConfig)</h2>
    <ConfigTable :items="programmaticOptions" title="setupTracing(config) / bootstrapHaocApp(Module, config)" />
  </div>
</template>
