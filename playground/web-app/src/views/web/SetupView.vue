<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Setup</h1>
    <p class="text-body-1 mb-6">
      Como integrar o <code>@haocruz/opentelemetry-web</code> na sua aplicação frontend.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1" color="teal">mdi-vuejs</v-icon> Vue 3
    </h2>
    <CodeBlock language="typescript" title="main.ts" :code="`import { createApp } from 'vue';
import { initTracing, setUser, createVueErrorHandler } from '@haocruz/opentelemetry-web';
import App from './App.vue';

// 1. Inicializa tracing ANTES de montar o app
initTracing({
  serviceName: 'meu-frontend',
  collectorUrl: 'http://localhost:4318',
  propagateTraceHeaderCorsUrls: [/localhost/, /api\\.meudominio\\.com/],
  environment: import.meta.env.VITE_OTEL_ENVIRONMENT || 'local',
});

// 2. (Opcional) Seta identidade do usuário após login
setUser({
  id: 'user-123',
  role: 'admin',
  type: 'authenticated',
});

// 3. Cria o app Vue e registra o error handler
const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
app.mount('#app');`" />

    <v-alert type="info" variant="tonal" density="compact" class="mt-4 mb-6">
      <strong>propagateTraceHeaderCorsUrls:</strong> Regex dos domínios que receberão os headers
      <code>traceparent</code> e <code>baggage</code>. Se não configurado, os headers não são
      propagados em requests cross-origin.
    </v-alert>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1" color="blue">mdi-react</v-icon> React
    </h2>
    <CodeBlock language="typescript" title="main.tsx" :code="`import React from 'react';
import ReactDOM from 'react-dom/client';
import { initTracing, setUser } from '@haocruz/opentelemetry-web';
import App from './App';

initTracing({
  serviceName: 'meu-frontend-react',
  collectorUrl: 'http://localhost:4318',
  propagateTraceHeaderCorsUrls: [/localhost/],
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1" color="amber">mdi-language-javascript</v-icon> Vanilla JS
    </h2>
    <CodeBlock language="typescript" title="main.js" :code="`import { initTracing } from '@haocruz/opentelemetry-web';

initTracing({
  serviceName: 'meu-frontend',
  collectorUrl: 'http://localhost:4318',
  propagateTraceHeaderCorsUrls: [/localhost/],
});

// Todos os fetch() e XMLHttpRequest a partir daqui são instrumentados
fetch('/api/data').then(r => r.json());`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-docker</v-icon> Docker / Produção
    </h2>
    <p class="text-body-2 mb-3">O SDK Web roda no navegador, então as configurações devem ser passadas em build-time via variáveis Vite:</p>
    <CodeBlock language="bash" title=".env.production" :code="`VITE_OTEL_SERVICE_NAME=meu-frontend
VITE_OTEL_COLLECTOR_URL=https://otel-collector.meudominio.com
VITE_OTEL_ENVIRONMENT=production`" />

    <CodeBlock language="typescript" title="main.ts" :code="`initTracing({
  serviceName: import.meta.env.VITE_OTEL_SERVICE_NAME || 'frontend',
  collectorUrl: import.meta.env.VITE_OTEL_COLLECTOR_URL || 'http://localhost:4318',
  environment: import.meta.env.VITE_OTEL_ENVIRONMENT || 'local',
});`" />

    <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
      <strong>CORS:</strong> O SigNoz collector precisa aceitar requests do domínio do seu frontend.
      Configure <code>allowed_origins</code> no <code>otel-collector-config.yaml</code>.
    </v-alert>
  </div>
</template>
