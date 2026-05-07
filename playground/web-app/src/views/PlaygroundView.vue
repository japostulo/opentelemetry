<script setup lang="ts">
import { ref } from 'vue';
import ApiTester from '../components/ApiTester.vue';

const showConfig = ref(false);

function triggerJsError() {
  throw new Error('Playground test error — this should appear as a span in SigNoz');
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Playground</h1>
      <v-spacer />
      <v-btn variant="outlined" href="http://localhost:3301" target="_blank" prepend-icon="mdi-chart-timeline-variant">
        Abrir SigNoz
      </v-btn>
    </div>

    <v-alert type="info" variant="tonal" class="mb-6" density="compact">
      <strong>Como usar:</strong> Clique nos botões para disparar requests. Verifique os traces no
      <a href="http://localhost:3301" target="_blank">SigNoz (localhost:3301)</a>.
      Para alterar o profile em tempo real (sem restart), use o
      <router-link to="/profile-builder"><strong>Profile Builder</strong></router-link>.
    </v-alert>

    <!-- Configuration Panel -->
    <v-expansion-panels v-model="showConfig" class="mb-6">
      <v-expansion-panel title="Configuração do Ambiente">
        <v-expansion-panel-text>
          <v-table density="compact">
            <thead><tr><th>Variável</th><th>Valor Atual</th><th>Opções</th></tr></thead>
            <tbody>
              <tr><td><code>HAOC_OTEL_PROFILE</code></td><td>Definido no docker-compose.yml (padrão inicial)</td><td><code>minimal</code> | <code>standard</code> | <code>verbose</code></td></tr>
              <tr><td><code>HAOC_OTEL_CAPTURE_BODY</code></td><td>—</td><td><code>true</code> | <code>false</code> (override do profile)</td></tr>
              <tr><td><code>HAOC_OTEL_CAPTURE_RESPONSE</code></td><td>—</td><td><code>true</code> | <code>false</code> (override do profile)</td></tr>
              <tr><td><code>LOG_DESTINATION</code></td><td>both</td><td><code>both</code> | <code>console</code> | <code>signoz</code> | <code>none</code></td></tr>
            </tbody>
          </v-table>
          <v-alert type="success" variant="tonal" density="compact" class="mt-3">
            <strong>Runtime:</strong> profile, captureBody, captureResponse e logDestination podem ser alterados sem restart via
            <router-link to="/profile-builder">Profile Builder</router-link> ou diretamente via
            <code>PUT /admin/config</code>.
          </v-alert>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-2">
            <strong>Requer rebuild:</strong> Apenas instrumentações (DB, fs, net) e sampleRatio exigem
            <code>docker compose up -d --build</code>.
          </v-alert>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Happy Path -->
    <h2 class="text-h5 font-weight-bold mb-3 text-success">
      <v-icon class="mr-1">mdi-check-circle</v-icon> Happy Path
    </h2>
    <v-row>
      <v-col cols="12" md="4">
        <ApiTester label="NestJS /hello" url="http://localhost:3010/hello" color="blue" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Express /hello" url="http://localhost:3020/hello" color="green" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Laravel /api/hello" url="http://localhost:8085/api/hello" color="red" />
      </v-col>
    </v-row>

    <!-- Distributed Chains -->
    <h2 class="text-h5 font-weight-bold mb-3 mt-6 text-purple">
      <v-icon class="mr-1">mdi-link-variant</v-icon> Distributed Chains
    </h2>
    <v-row>
      <v-col cols="12" md="6">
        <ApiTester label="Full Chain (4 services)" url="http://localhost:3010/chain" color="purple" />
      </v-col>
      <v-col cols="12" md="6">
        <ApiTester label="NestJS → Laravel" url="http://localhost:3010/chain-laravel" color="deep-purple" />
      </v-col>
    </v-row>

    <!-- Error Scenarios -->
    <h2 class="text-h5 font-weight-bold mb-3 mt-6 text-error">
      <v-icon class="mr-1">mdi-alert-circle</v-icon> Error Scenarios
    </h2>
    <v-row>
      <v-col cols="12" md="4">
        <ApiTester label="NestJS 400" url="http://localhost:3010/error-4xx" color="orange" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="NestJS 500" url="http://localhost:3010/error-5xx" color="red" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Chain Error" url="http://localhost:3010/chain-error" color="red-darken-3" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Laravel 400" url="http://localhost:8085/api/error-4xx" color="orange" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Laravel 500" url="http://localhost:8085/api/error-5xx" color="red" />
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="mb-3">
          <v-card-text class="pa-3">
            <v-btn size="small" variant="flat" color="red-darken-4" @click="triggerJsError">
              <v-icon start size="small">mdi-play</v-icon> JS Error (global)
            </v-btn>
            <div class="text-caption text-grey mt-1">Lança erro JS capturado pelo createVueErrorHandler()</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Latency / Body / Identity -->
    <h2 class="text-h5 font-weight-bold mb-3 mt-6 text-warning">
      <v-icon class="mr-1">mdi-timer-outline</v-icon> Latency / Body / Identity
    </h2>
    <v-row>
      <v-col cols="12" md="4">
        <ApiTester label="Slow (3s)" url="http://localhost:3010/slow?ms=3000" color="amber-darken-2" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="POST /echo (sensitive)" url="http://localhost:3010/echo" method="POST"
          :body='JSON.stringify({ name: "Test User", password: "secret123", cpf: "12345678900", message: "Hello!" })'
          color="amber-darken-2" />
      </v-col>
      <v-col cols="12" md="4">
        <ApiTester label="Identity" url="http://localhost:3010/identity" color="cyan" />
      </v-col>
    </v-row>
  </div>
</template>
