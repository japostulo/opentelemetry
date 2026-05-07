<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">@haocruz/opentelemetry-web</h1>
    <v-chip size="small" color="teal" variant="flat" class="mb-4">Browser</v-chip>
    <v-chip size="small" variant="outlined" class="ml-2 mb-4">v1.0.0</v-chip>

    <p class="text-body-1 mb-6">
      SDK de observabilidade para aplicações frontend (Vue, React, vanilla JS).
      Instrumenta fetch/XHR, document-load, captura erros globais e propaga contexto via W3C Trace Context e Baggage.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Funcionalidades</h2>
    <v-list density="compact">
      <v-list-item prepend-icon="mdi-web">
        <v-list-item-title>Instrumentação de Fetch e XMLHttpRequest</v-list-item-title>
        <v-list-item-subtitle>Cria spans para cada request HTTP do navegador</v-list-item-subtitle>
      </v-list-item>
      <v-list-item prepend-icon="mdi-file-document-outline">
        <v-list-item-title>Document Load instrumentation</v-list-item-title>
        <v-list-item-subtitle>Mede performance de carregamento da página</v-list-item-subtitle>
      </v-list-item>
      <v-list-item prepend-icon="mdi-alert-circle-outline">
        <v-list-item-title>Captura de erros (window.onerror + unhandledrejection)</v-list-item-title>
        <v-list-item-subtitle>Erros globais são registrados como spans com status ERROR</v-list-item-subtitle>
      </v-list-item>
      <v-list-item prepend-icon="mdi-link-variant">
        <v-list-item-title>W3C Trace Context propagation</v-list-item-title>
        <v-list-item-subtitle>Conecta spans do frontend com os do backend (mesmo traceId)</v-list-item-subtitle>
      </v-list-item>
      <v-list-item prepend-icon="mdi-bag-suitcase-outline">
        <v-list-item-title>W3C Baggage propagation</v-list-item-title>
        <v-list-item-subtitle>Propaga page.url, browser.name, device.type para o backend</v-list-item-subtitle>
      </v-list-item>
      <v-list-item prepend-icon="mdi-vuejs">
        <v-list-item-title>Vue Error Handler integrado</v-list-item-title>
        <v-list-item-subtitle>createVueErrorHandler() registra app.config.errorHandler do Vue</v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Quick Start</h2>
    <CodeBlock language="bash" title="Instalação" code="npm install @haocruz/opentelemetry-web" />

    <CodeBlock language="typescript" title="main.ts (Vue)" :code="`import { createApp } from 'vue';
import { initTracing, setUser, createVueErrorHandler } from '@haocruz/opentelemetry-web';
import App from './App.vue';

initTracing({
  serviceName: 'meu-frontend',
  collectorUrl: 'http://localhost:4318',
  propagateTraceHeaderCorsUrls: [/localhost/],
  environment: 'local',
});

setUser({ id: 'user-123', role: 'admin' });

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
app.mount('#app');`" />

    <h2 class="text-h5 font-weight-bold mb-3 mt-6">Arquitetura</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
┌─────────────────────────────────────────────────────────┐
│                    Browser (SPA)                        │
│                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ initTracing  │  │ setUser()     │  │ createVue    │ │
│  │  (SDK init)  │  │ (baggage)     │  │ ErrorHandler │ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Fetch/XHR spans + W3C headers (traceparent +   │   │
│  │  baggage) propagados no request header           │   │
│  └─────────────────────┬───────────────────────────┘   │
└────────────────────────┼───────────────────────────────┘
                         │ OTLP/HTTP
                         ▼
                  ┌──────────────┐
                  │    SigNoz    │
                  │  (Traces)    │
                  └──────────────┘</pre>
    </v-card>
  </div>
</template>
