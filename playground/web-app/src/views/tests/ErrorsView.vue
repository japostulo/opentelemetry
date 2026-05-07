<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { errorScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Errors</h1>
    <p class="text-body-1 mb-6">
      Testes de captura de erros em cada aplicação.
      Valida span status ERROR, exception events, error.message e error.type.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>OTel Convention:</strong> Erros 4xx podem ou não setar span status ERROR (depende da implementação).
      No nosso caso, tanto NestJS quanto Laravel setam ERROR para <code>status >= 400</code>.
      Erros 5xx sempre geram exception events com stack trace.
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">O que verificar no SigNoz</h2>
    <v-row class="mb-6">
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4" color="red">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Span Status</h3>
          <p class="text-body-2">
            Traces → Span detail → statusCode deve ser <code>ERROR</code>.
            O span deve ter cor vermelha no flamegraph.
          </p>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4" color="orange">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Error Attributes</h3>
          <p class="text-body-2">
            Tags → <code>error.message</code> (mensagem da exceção) e
            <code>error.type</code> (nome da classe/tipo).
          </p>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4" color="amber">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Exception Event</h3>
          <p class="text-body-2">
            Events tab → <code>exception</code> event com
            <code>exception.message</code>, <code>exception.stacktrace</code>.
          </p>
        </v-card>
      </v-col>
    </v-row>

    <TestScenarioTable :scenarios="errorScenarios" title="Error Scenarios (E1-E6)" />
  </div>
</template>
