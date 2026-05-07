<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { logDestinationScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Log Destination</h1>
    <p class="text-body-1 mb-6">
      Testes de controle de destino dos logs via <code>LOG_DESTINATION</code>.
      Valida que logs vão para o(s) destino(s) correto(s) e não aparecem onde não devem.
    </p>

    <v-alert type="warning" variant="tonal" density="compact" class="mb-6">
      <strong>Como testar:</strong> Para cada cenário, é necessário alterar <code>LOG_DESTINATION</code> no
      <code>docker-compose.yml</code> (ou via <code>.env</code>) e recriar o container.
      <br><br>
      <code>LOG_DESTINATION=console docker compose up -d --build nestjs-app</code>
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">Validação Manual</h2>
    <v-card variant="outlined" class="pa-4 mb-6">
      <h3 class="text-subtitle-1 font-weight-bold mb-2">Para cada cenário:</h3>
      <v-list density="compact">
        <v-list-item>
          <template #prepend><v-chip size="x-small" variant="flat">1</v-chip></template>
          <v-list-item-title>Altere LOG_DESTINATION e rebuild o container</v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" variant="flat">2</v-chip></template>
          <v-list-item-title>Execute o request (botão ou curl)</v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" variant="flat">3</v-chip></template>
          <v-list-item-title>Verifique <strong>docker logs</strong>: <code>docker logs playground-{app}-1 --tail 20</code></v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" variant="flat">4</v-chip></template>
          <v-list-item-title>Verifique <strong>SigNoz → Logs</strong>: filtre por serviceName e timestamp</v-list-item-title>
        </v-list-item>
        <v-list-item>
          <template #prepend><v-chip size="x-small" variant="flat">5</v-chip></template>
          <v-list-item-title>Marque o checkbox se ambas as verificações bateram</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <TestScenarioTable :scenarios="logDestinationScenarios" title="Log Destination Scenarios (C1-C12)" />
  </div>
</template>
