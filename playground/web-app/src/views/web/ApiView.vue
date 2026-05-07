<script setup lang="ts">
import ConfigTable from '../../components/ConfigTable.vue';
import CodeBlock from '../../components/CodeBlock.vue';

const initTracingOptions = [
  { name: 'serviceName', type: 'string', required: true, description: 'Nome do serviço no SigNoz' },
  { name: 'collectorUrl', type: 'string', default: 'http://localhost:4318', description: 'Endpoint do OTLP collector (HTTP)' },
  { name: 'propagateTraceHeaderCorsUrls', type: 'RegExp[]', required: true, description: 'Regex dos domínios que recebem headers traceparent + baggage' },
  { name: 'environment', type: 'string', default: "'local'", description: 'Ambiente (local, staging, production)' },
];

const setUserParams = [
  { name: 'id', type: 'string', description: 'ID do usuário (será propagado como haoc.user.id no baggage)' },
  { name: 'role', type: 'string', description: 'Role do usuário (ex: admin, viewer)' },
  { name: 'type', type: "'authenticated' | 'anonymous' | 'service'", default: "'authenticated'", description: 'Tipo de identidade' },
];

const baggageItems = [
  { name: 'haoc.user.id', type: 'string', description: 'ID do usuário setado via setUser()' },
  { name: 'haoc.user.role', type: 'string', description: 'Role do usuário' },
  { name: 'haoc.user.type', type: 'string', description: 'Tipo de identidade' },
  { name: 'page.url', type: 'string', description: 'URL completa da página atual' },
  { name: 'page.title', type: 'string', description: 'document.title' },
  { name: 'page.referrer', type: 'string', description: 'document.referrer' },
  { name: 'browser.name', type: 'string', description: 'User-agent parser: Chrome, Firefox, etc.' },
  { name: 'browser.version', type: 'string', description: 'Versão do browser' },
  { name: 'device.type', type: 'string', description: 'desktop | mobile | tablet' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">API Reference</h1>
    <p class="text-body-1 mb-6">Referência das funções exportadas pelo pacote.</p>

    <v-divider class="mb-6" />

    <!-- initTracing -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <code class="text-primary">initTracing(config)</code>
    </h2>
    <p class="text-body-2 mb-3">
      Inicializa o WebTracerProvider com instrumentações e exporters.
      <strong>Deve ser chamada antes de qualquer fetch/XHR.</strong>
    </p>
    <ConfigTable :items="initTracingOptions" title="Parâmetros" />

    <h3 class="text-h6 mb-2 mt-4">Instrumentações Registradas</h3>
    <v-table density="compact" class="mb-6">
      <thead><tr><th>Instrumentação</th><th>Descrição</th></tr></thead>
      <tbody>
        <tr><td>FetchInstrumentation</td><td>Cria span para cada window.fetch(), injeta headers traceparent + baggage</td></tr>
        <tr><td>XMLHttpRequestInstrumentation</td><td>Cria span para cada XMLHttpRequest (legacy)</td></tr>
        <tr><td>DocumentLoadInstrumentation</td><td>Mede timing de carregamento da página</td></tr>
      </tbody>
    </v-table>

    <v-divider class="my-6" />

    <!-- setUser -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <code class="text-primary">setUser(identity)</code>
    </h2>
    <p class="text-body-2 mb-3">
      Define identidade do usuário no baggage global. Será propagada em todos os requests subsequentes.
      Chamar novamente substitui a identidade anterior. Chamar <code>setUser(null)</code> remove a identidade.
    </p>
    <ConfigTable :items="setUserParams" title="HaocUserIdentity" />

    <CodeBlock language="typescript" title="Exemplo" :code="`import { setUser } from '@haocruz/opentelemetry-web';

// Após login
setUser({ id: user.id, role: user.role });

// Após logout
setUser(null);`" />

    <v-divider class="my-6" />

    <!-- createVueErrorHandler -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <code class="text-primary">createVueErrorHandler()</code>
    </h2>
    <p class="text-body-2 mb-3">
      Retorna uma função que captura erros do Vue (componentes, lifecycle hooks, watchers)
      e cria spans com status ERROR no OpenTelemetry. Registra como <code>app.config.errorHandler</code>.
    </p>
    <CodeBlock language="typescript" :code="`import { createVueErrorHandler } from '@haocruz/opentelemetry-web';

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
// Erros em components, watchers e lifecycle hooks serão capturados como spans`" />

    <v-divider class="my-6" />

    <!-- Baggage -->
    <h2 class="text-h5 font-weight-bold mb-3">Baggage Propagado</h2>
    <p class="text-body-2 mb-3">
      O SDK automaticamente propaga os seguintes itens como W3C Baggage em cada request:
    </p>
    <ConfigTable :items="baggageItems" title="Itens de Baggage" />

    <v-alert type="info" variant="tonal" density="compact" class="mt-4">
      <strong>No backend:</strong> O <code>HaocTraceInterceptor</code> (Node.js) e o <code>TraceRequest</code> (Laravel)
      extraem automaticamente estes itens do baggage header e os adicionam como span attributes.
    </v-alert>
  </div>
</template>
