<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { identityBaggageScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Identity & Baggage</h1>
    <p class="text-body-1 mb-6">
      Testes de identidade de usuário e propagação de baggage W3C entre frontend e backend.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-account-outline</v-icon> User Identity
    </h2>
    <p class="text-body-2 mb-3">
      Identidade de usuário é setada via <code>setUser()</code> (Web/Node.js) e propagada como span attributes:
    </p>
    <v-table density="compact" class="mb-6">
      <thead><tr><th>Attribute</th><th>Descrição</th><th>Fonte</th></tr></thead>
      <tbody>
        <tr><td><code>haoc.user.id</code></td><td>ID do usuário</td><td>setUser() no frontend ou backend</td></tr>
        <tr><td><code>haoc.user.role</code></td><td>Role do usuário</td><td>setUser()</td></tr>
        <tr><td><code>haoc.user.type</code></td><td>authenticated | anonymous | service</td><td>setUser() ou inferido</td></tr>
      </tbody>
    </v-table>

    <v-card variant="outlined" class="pa-4 mb-6">
      <h3 class="text-subtitle-1 font-weight-bold mb-2">Fluxo de Identity</h3>
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
  Frontend (Web SDK):
    setUser({ id: '123', role: 'admin' })
         │
         ▼
    Baggage header: haoc.user.id=123, haoc.user.role=admin
         │
         ▼
  Backend (NestJS/Express):
    HaocTraceInterceptor extrai baggage → span attributes
    getUserSpanAttributes() → haoc.user.id, haoc.user.role, haoc.user.type
         │
         ▼
  Backend → Backend:
    Baggage é re-propagado automaticamente pelo SDK</pre>
    </v-card>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-bag-suitcase-outline</v-icon> W3C Baggage
    </h2>
    <p class="text-body-2 mb-3">
      Além da identidade, o Web SDK propaga informações contextuais do navegador via W3C Baggage:
    </p>
    <v-table density="compact" class="mb-6">
      <thead><tr><th>Baggage Item</th><th>Exemplo</th><th>Onde aparece no SigNoz</th></tr></thead>
      <tbody>
        <tr><td><code>page.url</code></td><td>http://localhost:8090/playground</td><td>Span tags do backend</td></tr>
        <tr><td><code>page.title</code></td><td>Playground - HAOC OTel</td><td>Span tags do backend</td></tr>
        <tr><td><code>page.referrer</code></td><td>http://localhost:8090/</td><td>Span tags do backend</td></tr>
        <tr><td><code>browser.name</code></td><td>Chrome</td><td>Span tags do backend</td></tr>
        <tr><td><code>browser.version</code></td><td>120.0.0.0</td><td>Span tags do backend</td></tr>
        <tr><td><code>device.type</code></td><td>desktop</td><td>Span tags do backend</td></tr>
      </tbody>
    </v-table>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Para validar no SigNoz:</strong> Após um request do frontend (web-app) para o backend,
      abra o span do backend (NestJS/Express) e verifique os tags <code>page.*</code>, <code>browser.*</code>,
      <code>device.*</code>. Estes dados vêm do header <code>baggage</code> propagado automaticamente.
    </v-alert>

    <TestScenarioTable :scenarios="identityBaggageScenarios" title="Identity & Baggage Scenarios (G1-G2, H1-H2)" />
  </div>
</template>
