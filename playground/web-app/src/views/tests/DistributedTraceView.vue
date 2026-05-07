<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { distributedTraceScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Distributed Tracing</h1>
    <p class="text-body-1 mb-6">
      Testes de rastreamento distribuído entre serviços.
      Valida propagação de contexto W3C (traceparent) e visualização no flamegraph do SigNoz.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Validação:</strong> Os cenários de distributed trace são validados visualmente no flamegraph do SigNoz.
      Cada serviço deve aparecer como uma camada separada sob o mesmo traceId.
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">Cadeia de Serviços</h2>
    <v-card variant="outlined" class="pa-4 mb-6">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
  Full Chain (/chain):
  ┌────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
  │ Web (SPA)  │──▶ │ NestJS:3010 │──▶ │ Express:3020│──▶ │ Laravel:8085 │
  │ fetch()    │    │ /chain      │    │ /hello      │    │ /api/hello   │
  └────────────┘    └─────────────┘    └─────────────┘    └──────────────┘

  NestJS → Laravel (/chain-laravel):
  ┌────────────┐    ┌─────────────┐    ┌──────────────┐
  │ Web (SPA)  │──▶ │ NestJS:3010 │──▶ │ Laravel:8085 │
  │ fetch()    │    │ /chain-lar  │    │ /api/hello   │
  └────────────┘    └─────────────┘    └──────────────┘

  Chain Error (/chain-error):
  ┌────────────┐    ┌─────────────┐    ┌─────────────┐
  │ Web (SPA)  │──▶ │ NestJS:3010 │──▶ │ Express:3020│ ← 500 ERROR
  │ fetch()    │    │ /chain-err  │    │ /error-5xx  │
  └────────────┘    └─────────────┘    └─────────────┘</pre>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Como Validar no SigNoz</h2>
    <v-card variant="outlined" class="pa-4 mb-6">
      <v-list density="compact">
        <v-list-item>
          <template #prepend><v-chip size="x-small" color="primary" variant="flat">1</v-chip></template>
          <v-list-item-title>Abra SigNoz → <strong>Traces</strong></v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" color="primary" variant="flat">2</v-chip></template>
          <v-list-item-title>Filtre por <code>serviceName = playground-nestjs</code> (ponto de entrada)</v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" color="primary" variant="flat">3</v-chip></template>
          <v-list-item-title>Clique no trace mais recente → <strong>Flamegraph</strong></v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" color="primary" variant="flat">4</v-chip></template>
          <v-list-item-title>Verifique que há spans de múltiplos serviços no mesmo trace</v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" color="primary" variant="flat">5</v-chip></template>
          <v-list-item-title>Para erros: verifique que spans com erro têm cor vermelha e <code>statusCode=ERROR</code></v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <TestScenarioTable :scenarios="distributedTraceScenarios" title="Distributed Trace Scenarios (D1-D4)" />
  </div>
</template>
