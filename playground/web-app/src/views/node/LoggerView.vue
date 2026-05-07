<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Logger</h1>
    <p class="text-body-1 mb-6">
      O sistema de logging usa Pino com suporte a múltiplos destinos: console, SigNoz (via OTLP), ambos ou nenhum.
      Controlado pela variável <code>LOG_DESTINATION</code>.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">LOG_DESTINATION</h2>
    <v-table density="comfortable" class="mb-6">
      <thead>
        <tr>
          <th>Valor</th>
          <th>Console (stdout)</th>
          <th>SigNoz (OTLP)</th>
          <th>Descrição</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>both</code> <v-chip size="x-small" color="info" variant="flat">default</v-chip></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td>Logs em ambos os destinos. Pino-pretty no dev, async stdout no prod.</td>
        </tr>
        <tr>
          <td><code>console</code></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td>Apenas console. BatchLogRecordProcessor não é criado.</td>
        </tr>
        <tr>
          <td><code>signoz</code></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td>Pino escreve em /dev/null, mas @opentelemetry/instrumentation-pino intercepta antes do write e envia via OTLP.</td>
        </tr>
        <tr>
          <td><code>none</code></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td>Pino level: silent. Nenhum log emitido.</td>
        </tr>
      </tbody>
    </v-table>

    <h2 class="text-h5 font-weight-bold mb-3">Como Funciona (signoz mode)</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
 Código da aplicação
        │
        ▼
  logger.info({...})          ← Pino logger call
        │
        ├──▶ @opentelemetry/instrumentation-pino
        │    intercepta o record ANTES do write
        │    e envia via BatchLogRecordProcessor → OTLP → SigNoz
        │
        └──▶ Writable(/dev/null)   ← stdout é descartado
             (quando destination='signoz')</pre>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">buildLoggerConfig()</h2>
    <p class="text-body-2 mb-3">Função que retorna a configuração Pino baseada nas opções:</p>
    <CodeBlock language="typescript" :code="`import { buildLoggerConfig } from '@haocruz/opentelemetry';

const { pinoOptions, stream } = buildLoggerConfig({
  destination: 'signoz',    // 'both' | 'console' | 'signoz' | 'none'
  level: 'info',            // 'debug' | 'info' | 'warn' | 'error'
  extraRedactPaths: ['req.headers.cookie'],
});`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Redação em Logs</h2>
    <p class="text-body-2 mb-3">Dupla proteção contra vazamento de dados sensíveis:</p>
    <v-row>
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Camada 1: Flatten</h3>
          <p class="text-body-2"><code>flattenToRecord()</code> verifica cada campo contra
            <code>DEFAULT_SENSITIVE_FIELDS</code> e substitui por <code>[REDACTED]</code>.</p>
          <p class="text-caption mt-2">Campos default: password, token, access_token, secret, authorization, db_password, tasy_password</p>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Camada 2: Pino Redact</h3>
          <p class="text-body-2"><code>DEFAULT_REDACT_PATHS</code> no Pino options garante que
            qualquer <code>logger.info()</code> direto também tenha redação.</p>
          <p class="text-caption mt-2">Paths: req.headers.authorization, body.password, body.*.password, etc.</p>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
