<script setup lang="ts">
export type ProfileName = 'minimal' | 'standard' | 'verbose';

const props = defineProps<{ profile: ProfileName }>();

interface ProfileDef {
  node: {
    captureRequestBody: boolean;
    captureResponseBody: boolean;
    logRequestBody: boolean;
    logResponseBody: boolean;
    expressIgnoreLayers: string[];
    instrumentations: string;
    sampleRatio: string;
    ignoreRoutes: string[];
  };
  laravel: {
    captureRequestBody: boolean;
    captureResponseBody: boolean;
    ignoreRoutes: string[];
  };
  web: {
    description: string;
  };
}

const PROFILES: Record<ProfileName, ProfileDef> = {
  minimal: {
    node: {
      captureRequestBody: false,
      captureResponseBody: false,
      logRequestBody: true,
      logResponseBody: true,
      expressIgnoreLayers: ['middleware', 'router', 'request_handler'],
      instrumentations: 'http, express, nestjs, pg, pino',
      sampleRatio: '1.0 (0.2 em production)',
      ignoreRoutes: ['/health', '/healthz', '/ready', '/live', '/metrics', '/favicon.ico', '*.js/css/png…'],
    },
    laravel: {
      captureRequestBody: false,
      captureResponseBody: false,
      ignoreRoutes: ['/health', '/metrics'],
    },
    web: {
      description: 'Page views (CLS, LCP, FCP), JS errors, fetch/XHR traces. Profile não se aplica ao SDK web — sempre coleta tudo.',
    },
  },
  standard: {
    node: {
      captureRequestBody: true,
      captureResponseBody: true,
      logRequestBody: true,
      logResponseBody: true,
      expressIgnoreLayers: ['middleware'],
      instrumentations: 'http, express, nestjs, pg, mysql, mysql2, mongodb, ioredis, redis, pino',
      sampleRatio: '1.0 (0.2 em production)',
      ignoreRoutes: ['/health', '/healthz', '/ready', '/live', '/metrics', '/favicon.ico'],
    },
    laravel: {
      captureRequestBody: true,
      captureResponseBody: true,
      ignoreRoutes: ['/health', '/metrics'],
    },
    web: {
      description: 'Igual ao minimal — SDK web coleta tudo independentemente do profile.',
    },
  },
  verbose: {
    node: {
      captureRequestBody: true,
      captureResponseBody: true,
      logRequestBody: true,
      logResponseBody: true,
      expressIgnoreLayers: [],
      instrumentations: 'todos + fs, net, dns',
      sampleRatio: '1.0 (fixo, ignora NODE_ENV)',
      ignoreRoutes: ['nenhum'],
    },
    laravel: {
      captureRequestBody: true,
      captureResponseBody: true,
      ignoreRoutes: ['nenhum'],
    },
    web: {
      description: 'Igual ao minimal — SDK web coleta tudo.',
    },
  },
};

const nodeCodeMap: Record<ProfileName, string> = {
  minimal: `// Node.js — Profile: minimal
setupTracing({
  profile: 'minimal',
  // ✗ captureRequestBody  = false → SEM body.* nos spans
  // ✗ captureResponseBody = false → SEM response.* nos spans
  // ✓ logRequestBody      = true  → body nos logs Pino
  // ✓ logResponseBody     = true  → response nos logs Pino
  // expressIgnoreLayers: [middleware, router, request_handler]
  // Instrumentações ativas: pg, http, express, nestjs, pino
  // Paths ignorados: /health, /metrics, arquivos estáticos
});

// Resultado: span mínimo para GET /hello
// {
//   "name": "GET /hello",
//   "attributes": {
//     "http.method": "GET",
//     "http.route": "/hello",
//     "http.status_code": 200
//     // ← SEM body.*, SEM response.*
//   }
// }`,
  standard: `// Node.js — Profile: standard
setupTracing({
  profile: 'standard',
  // ✓ captureRequestBody  = true → body.* nos spans (com redação)
  // ✓ captureResponseBody = true → response.* nos spans
  // ✓ logRequestBody      = true → body nos logs Pino
  // expressIgnoreLayers: [middleware]   ← router e request_handler ativos
  // Instrumentações: + mysql, mysql2, mongodb, redis
});

// POST /echo com { name: "João", password: "s3cr3t" }:
// {
//   "name": "POST /echo",
//   "attributes": {
//     "body.name": "João",
//     "body.password": "[REDACTED]",   ← campo sensível
//     "response.service": "nestjs",
//     "response.received.name": "João"
//   }
// }`,
  verbose: `// Node.js — Profile: verbose
setupTracing({
  profile: 'verbose',
  // ✓ captureRequestBody  = true
  // ✓ captureResponseBody = true
  // expressIgnoreLayers: []   ← TODOS os spans Express visíveis
  // Instrumentações: + fs, net, dns (I/O de baixo nível)
  // sampleRatio: 1.0 fixo (ignora NODE_ENV=production)
  // ignoreRoutes: nenhum
});

// Spans adicionais visíveis no SigNoz:
//   middleware - <anonymous>
//   router - /
//   request handler - /hello
//   dns.lookup (se resolver hostname)`,
};

const laravelCodeMap: Record<ProfileName, string> = {
  minimal: `<!-- Laravel — Profile: minimal -->
<!-- config/haoc-otel.php -->
return [
    'profile' => 'minimal',
    // ✗ captureRequestBody  = false → SEM body.* nos spans
    // ✗ captureResponseBody = false → SEM response.* nos spans
    // logDestination = env('LOG_DESTINATION', 'both')
];

// Span para POST /api/echo:
// {
//   "name": "TraceRequest POST /api/echo",
//   "attributes": {
//     "http.method": "POST",
//     "http.route": "/api/echo",
//     "http.status_code": 200
//     // ← SEM body.*, SEM response.*
//   }
// }`,
  standard: `<!-- Laravel — Profile: standard -->
return [
    'profile' => 'standard',
    // ✓ captureRequestBody  = true → body.* nos spans
    // ✓ captureResponseBody = true → response.* nos spans
];

// POST /api/echo com { name: "Ana", cpf: "111" }:
// {
//   "name": "TraceRequest POST /api/echo",
//   "attributes": {
//     "body.name": "Ana",
//     "body.cpf":  "[REDACTED]",   ← campo sensível
//     "response.service": "laravel",
//     "response.received.name": "Ana"
//   }
// }`,
  verbose: `<!-- Laravel — Profile: verbose -->
return [
    'profile' => 'verbose',
    // ✓ captureRequestBody  = true
    // ✓ captureResponseBody = true
    // ignoreRoutes: nenhum (nem /health é ignorado)
];`,
};

const webCode = `// Browser (Web SDK) — Profile não se aplica
initHaocWeb({
  serviceName: 'my-spa',
  endpoint: '/api/otlp',
  // O SDK web coleta SEMPRE:
  // ✓ Métricas de Web Vitals (CLS, LCP, FCP, INP, TTFB)
  // ✓ Erros JS globais via window.onerror / unhandledrejection
  // ✓ Traces de fetch/XHR
  // ✓ Identidade do usuário via setUser()
  // ✓ Baggage propagado para serviços downstream
});`;
</script>

<template>
  <div>
    <v-row>
      <!-- Node.js -->
      <v-col cols="12">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="d-flex align-center pa-4 pb-2">
            <v-icon color="green" class="mr-2">mdi-nodejs</v-icon>
            Node.js (NestJS / Express) — {{ profile }}
          </v-card-title>
          <v-card-text class="pa-4 pt-0">
            <v-row dense>
              <v-col cols="12" md="5">
                <v-list density="compact">
                  <v-list-item>
                    <template #prepend>
                      <v-icon :color="PROFILES[profile].node.captureRequestBody ? 'success' : 'error'" size="small">
                        {{ PROFILES[profile].node.captureRequestBody ? 'mdi-check' : 'mdi-close' }}
                      </v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">captureRequestBody</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ PROFILES[profile].node.captureRequestBody ? 'body.* nos spans' : 'sem body.* nos spans' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template #prepend>
                      <v-icon :color="PROFILES[profile].node.captureResponseBody ? 'success' : 'error'" size="small">
                        {{ PROFILES[profile].node.captureResponseBody ? 'mdi-check' : 'mdi-close' }}
                      </v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">captureResponseBody</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ PROFILES[profile].node.captureResponseBody ? 'response.* nos spans' : 'sem response.* nos spans' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template #prepend>
                      <v-icon color="success" size="small">mdi-check</v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">logRequestBody + logResponseBody</v-list-item-title>
                    <v-list-item-subtitle>sempre true — body nos logs Pino</v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template #prepend>
                      <v-icon color="blue" size="small">mdi-layers</v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">expressIgnoreLayers</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ PROFILES[profile].node.expressIgnoreLayers.length
                          ? PROFILES[profile].node.expressIgnoreLayers.join(', ')
                          : 'nenhum (todos os spans visíveis)' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template #prepend>
                      <v-icon color="blue" size="small">mdi-database</v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">Instrumentações</v-list-item-title>
                    <v-list-item-subtitle>{{ PROFILES[profile].node.instrumentations }}</v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template #prepend>
                      <v-icon color="blue" size="small">mdi-percent</v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">sampleRatio</v-list-item-title>
                    <v-list-item-subtitle>{{ PROFILES[profile].node.sampleRatio }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-col>
              <v-col cols="12" md="7">
                <pre class="text-caption pa-3 bg-grey-darken-4 rounded text-green-lighten-2"
                  style="overflow-x: auto; white-space: pre-wrap; font-family: monospace; font-size: 11px;"
                >{{ nodeCodeMap[profile] }}</pre>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Laravel -->
      <v-col cols="12" md="6">
        <v-card variant="outlined">
          <v-card-title class="d-flex align-center pa-4 pb-2">
            <v-icon color="red" class="mr-2">mdi-language-php</v-icon>
            Laravel — {{ profile }}
          </v-card-title>
          <v-card-text class="pa-4 pt-0">
            <v-list density="compact" class="mb-2">
              <v-list-item>
                <template #prepend>
                  <v-icon :color="PROFILES[profile].laravel.captureRequestBody ? 'success' : 'error'" size="small">
                    {{ PROFILES[profile].laravel.captureRequestBody ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-body-2">captureRequestBody</v-list-item-title>
              </v-list-item>
              <v-list-item>
                <template #prepend>
                  <v-icon :color="PROFILES[profile].laravel.captureResponseBody ? 'success' : 'error'" size="small">
                    {{ PROFILES[profile].laravel.captureResponseBody ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-body-2">captureResponseBody</v-list-item-title>
              </v-list-item>
            </v-list>
            <pre class="text-caption pa-3 bg-grey-darken-4 rounded text-red-lighten-2"
              style="overflow-x: auto; white-space: pre-wrap; font-family: monospace; font-size: 11px;"
            >{{ laravelCodeMap[profile] }}</pre>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Web -->
      <v-col cols="12" md="6">
        <v-card variant="outlined">
          <v-card-title class="d-flex align-center pa-4 pb-2">
            <v-icon color="blue" class="mr-2">mdi-web</v-icon>
            Web (Browser SDK)
          </v-card-title>
          <v-card-text class="pa-4 pt-0">
            <v-alert type="info" variant="tonal" density="compact" class="mb-3 text-caption">
              {{ PROFILES[profile].web.description }}
            </v-alert>
            <pre class="text-caption pa-3 bg-grey-darken-4 rounded text-blue-lighten-2"
              style="overflow-x: auto; white-space: pre-wrap; font-family: monospace; font-size: 11px;"
            >{{ webCode }}</pre>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
