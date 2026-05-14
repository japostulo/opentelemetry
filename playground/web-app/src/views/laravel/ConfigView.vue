<script setup lang="ts">
import ConfigTable from '../../components/ConfigTable.vue';
import ProfileComparison from '../../components/ProfileComparison.vue';
import CodeBlock from '../../components/CodeBlock.vue';

const envVars = [
  { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', type: 'string', default: 'http://localhost:4318', required: true, description: 'Endpoint do collector OTLP (HTTP)' },
  { name: 'OTEL_SERVICE_NAME', type: 'string', required: true, description: 'Nome do serviço no SigNoz' },
  { name: 'OTEL_ENVIRONMENT', type: 'string', default: 'local', description: 'Ambiente (via APP_ENV se não definido)' },
  { name: 'OTEL_PROFILE', type: 'string', default: 'minimal', description: 'Profile: minimal | standard | verbose' },
  { name: 'OTEL_CAPTURE_BODY', type: 'boolean', description: 'Override: captura request body' },
  { name: 'OTEL_CAPTURE_RESPONSE', type: 'boolean', description: 'Override: captura response body' },
  { name: 'LOG_DESTINATION', type: 'string', default: 'both', description: 'Destino dos logs: both | console | signoz | none' },
  { name: 'LOG_LEVEL', type: 'string', default: 'info', description: 'Nível mínimo de log' },
  { name: 'APP_ENV', type: 'string', default: 'local', description: 'Usado como fallback para OTEL_ENVIRONMENT' },
];

const configKeys = [
  { name: 'profile', type: 'string', default: "'minimal'", description: "Profile baseline — env(OTEL_PROFILE)" },
  { name: 'service_name', type: 'string', description: "env(OTEL_SERVICE_NAME, 'laravel')" },
  { name: 'otlp_endpoint', type: 'string', description: "env(OTEL_EXPORTER_OTLP_ENDPOINT, 'http://localhost:4318')" },
  { name: 'environment', type: 'string', description: "env(OTEL_ENVIRONMENT, env(APP_ENV, 'local'))" },
  { name: 'sensitive_fields', type: 'array', description: 'Lista de campos que serão substituídos por [REDACTED]' },
  { name: 'profiles', type: 'array', description: 'Definição dos 3 profiles (minimal, standard, verbose)' },
];

const laravelProfiles = [
  { feature: 'captureBody', minimal: 'false', standard: 'true', verbose: 'true', description: 'Flatten request body como span attributes' },
  { feature: 'captureResponse', minimal: 'false', standard: 'true', verbose: 'true', description: 'Flatten response body como span attributes' },
  { feature: 'logBody', minimal: 'true', standard: 'true', verbose: 'true', description: 'Incluir body no contexto do log' },
  { feature: 'logResponse', minimal: 'true', standard: 'true', verbose: 'true', description: 'Incluir response no contexto do log' },
  { feature: 'sampleRate', minimal: '1.0', standard: '1.0', verbose: '1.0', description: 'Sampling rate (sempre 100% — PHP é request-scoped)' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Configuration</h1>
    <p class="text-body-1 mb-6">
      Referência completa do arquivo <code>config/haoc-otel.php</code> e variáveis de ambiente.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Precedência:</strong> Variável de ambiente (<code>OTEL_CAPTURE_BODY</code>) &gt; Default do profile
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">Variáveis de Ambiente</h2>
    <ConfigTable :items="envVars" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Config Keys (haoc-otel.php)</h2>
    <ConfigTable :items="configKeys" title="config('haoc-otel.*')" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Profiles</h2>
    <ProfileComparison :profiles="laravelProfiles" title="Comparação de Profiles (Laravel)" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Arquivo Completo</h2>
    <CodeBlock language="php" title="config/haoc-otel.php" :code="`<?php

return [
    'profile'      => env('OTEL_PROFILE', 'minimal'),
    'service_name' => env('OTEL_SERVICE_NAME', 'laravel'),
    'otlp_endpoint' => env('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318'),
    'environment'  => env('OTEL_ENVIRONMENT', env('APP_ENV', 'local')),

    'sensitive_fields' => [
        'password', 'token', 'access_token', 'secret',
        'authorization', 'db_password', 'tasy_password',
        'cpf', 'rg',
    ],

    'profiles' => [
        'minimal' => [
            'captureBody'     => false,
            'captureResponse' => false,
            'logBody'         => true,
            'logResponse'     => true,
        ],
        'standard' => [
            'captureBody'     => true,
            'captureResponse' => true,
            'logBody'         => true,
            'logResponse'     => true,
        ],
        'verbose' => [
            'captureBody'     => true,
            'captureResponse' => true,
            'logBody'         => true,
            'logResponse'     => true,
        ],
    ],
];`" />
  </div>
</template>
