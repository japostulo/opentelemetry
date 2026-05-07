<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { requestBodyScenarios, responseBodyScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Body Capture</h1>
    <p class="text-body-1 mb-6">
      Testes de captura de request body e response body como span attributes.
      Valida profiles, env overrides e redação de dados sensíveis.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Pré-requisito:</strong> Playground rodando (<code>docker compose -f playground/docker-compose.yml up -d</code>)
      e SigNoz acessível em <a href="http://localhost:3301" target="_blank">localhost:3301</a>.
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3 text-blue">
      <v-icon class="mr-1">mdi-upload</v-icon> Request Body
    </h2>
    <p class="text-body-2 mb-3">
      Valida se o body da request é capturado como span attributes (prefixo <code>body.*</code>)
      conforme o profile e env overrides.
    </p>
    <TestScenarioTable :scenarios="requestBodyScenarios" title="Request Body Scenarios (A1-A11)" />

    <v-divider class="my-8" />

    <h2 class="text-h5 font-weight-bold mb-3 text-green">
      <v-icon class="mr-1">mdi-download</v-icon> Response Body
    </h2>
    <p class="text-body-2 mb-3">
      Valida se o body da response é capturado como span attributes (prefixo <code>response.*</code>).
      Response body é extraído via:
    </p>
    <v-list density="compact" class="mb-4">
      <v-list-item>
        <template #prepend><v-chip size="x-small" color="blue" variant="flat">NestJS</v-chip></template>
        <v-list-item-title><code>tap()</code> no Observable (Interceptor)</v-list-item-title>
      </v-list-item>
      <v-list-item>
        <template #prepend><v-chip size="x-small" color="green" variant="flat">Express</v-chip></template>
        <v-list-item-title>Monkey-patch de <code>res.write()</code> / <code>res.end()</code> (buffer chunks)</v-list-item-title>
      </v-list-item>
      <v-list-item>
        <template #prepend><v-chip size="x-small" color="red" variant="flat">Laravel</v-chip></template>
        <v-list-item-title><code>$response->getContent()</code> + <code>json_decode()</code></v-list-item-title>
      </v-list-item>
    </v-list>
    <TestScenarioTable :scenarios="responseBodyScenarios" title="Response Body Scenarios (B1-B8)" />
  </div>
</template>
