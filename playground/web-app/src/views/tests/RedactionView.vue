<script setup lang="ts">
import TestScenarioTable from '../../components/TestScenarioTable.vue';
import { redactionScenarios } from '../../data/test-scenarios';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Redaction</h1>
    <p class="text-body-1 mb-6">
      Testes de redação automática de dados sensíveis no request/response body.
      Valida que campos como <code>password</code>, <code>token</code>, <code>cpf</code> são substituídos por <code>[REDACTED]</code>.
    </p>

    <v-alert type="error" variant="tonal" density="compact" class="mb-6">
      <strong>LGPD / Compliance:</strong> A redação é crítica para conformidade com LGPD.
      Dados sensíveis NUNCA devem aparecer em texto limpo nos spans ou logs do SigNoz.
    </v-alert>

    <h2 class="text-h5 font-weight-bold mb-3">Campos Sensíveis (Default)</h2>
    <v-row class="mb-6">
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">
            <v-icon class="mr-1" color="blue">mdi-nodejs</v-icon> Node.js (DEFAULT_SENSITIVE_FIELDS)
          </h3>
          <v-chip-group>
            <v-chip v-for="f in ['password', 'token', 'access_token', 'refresh_token', 'secret', 'authorization', 'db_password', 'tasy_password', 'cpf']" :key="f" size="small" color="red" variant="outlined">{{ f }}</v-chip>
          </v-chip-group>
          <p class="text-caption mt-2">Extensível via <code>extraSensitiveFields</code></p>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">
            <v-icon class="mr-1" color="red">mdi-language-php</v-icon> Laravel (sensitive_fields)
          </h3>
          <v-chip-group>
            <v-chip v-for="f in ['password', 'token', 'access_token', 'secret', 'authorization', 'db_password', 'tasy_password', 'cpf', 'rg']" :key="f" size="small" color="red" variant="outlined">{{ f }}</v-chip>
          </v-chip-group>
          <p class="text-caption mt-2">Configurável em <code>config/haoc-otel.php</code></p>
        </v-card>
      </v-col>
    </v-row>

    <h2 class="text-h5 font-weight-bold mb-3">Dupla Proteção (Node.js)</h2>
    <v-card variant="outlined" class="pa-4 mb-6">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
  Request body: { name: "Test", password: "secret123", cpf: "12345678900" }

  Camada 1 — flattenToSpan():
    body.name = "Test"
    body.password = "[REDACTED]"        ← DEFAULT_SENSITIVE_FIELDS
    body.cpf = "[REDACTED]"

  Camada 2 — flattenToRecord() (para logs):
    body.name = "Test"
    body.password = "[REDACTED]"
    body.cpf = "[REDACTED]"

  Camada 3 — Pino redact paths:
    req.headers.authorization → [Redacted]
    body.*.password → [Redacted]       ← caso escape das camadas anteriores</pre>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Flatten Profundo (Nested Objects)</h2>
    <v-card variant="outlined" class="pa-4 mb-6">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
  Input:  { user: { name: "Test", password: "secret", data: { token: "hidden", info: "visible" } } }

  Output (span attributes):
    body.user.name         = "Test"
    body.user.password     = "[REDACTED]"     ← match por nome do campo
    body.user.data.token   = "[REDACTED]"     ← match em qualquer profundidade
    body.user.data.info    = "visible"        ← campo não sensível, mantido</pre>
    </v-card>

    <TestScenarioTable :scenarios="redactionScenarios" title="Redaction Scenarios (F1-F4)" />
  </div>
</template>
