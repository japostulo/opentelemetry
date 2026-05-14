<script setup lang="ts">
import ProfileComparison from '../../components/ProfileComparison.vue';
import CodeBlock from '../../components/CodeBlock.vue';

const nodeProfiles = [
  { feature: 'captureRequestBody', minimal: 'false', standard: 'true', verbose: 'true', description: 'Flatten request body no span' },
  { feature: 'captureResponseBody', minimal: 'false', standard: 'true', verbose: 'true', description: 'Flatten response body no span' },
  { feature: 'logRequestBody', minimal: 'true', standard: 'true', verbose: 'true', description: 'Incluir body nos logs Pino' },
  { feature: 'logResponseBody', minimal: 'true', standard: 'true', verbose: 'true', description: 'Incluir response body nos logs Pino' },
  { feature: 'sampleRatio', minimal: '1.0 (0.2 prod)', standard: '1.0 (0.2 prod)', verbose: '1.0 (fixo)', description: 'Head-based sampling' },
  { feature: 'ignoreIncomingPaths', minimal: 'health, static', standard: 'health', verbose: 'nenhum', description: 'Paths HTTP ignorados pelo SDK' },
  { feature: 'expressIgnoreLayers', minimal: 'middleware, router', standard: 'middleware', verbose: 'nenhum', description: 'Camadas Express suprimidas' },
  { feature: 'Instrumentações DB', minimal: 'pg apenas', standard: 'pg, mysql, mongodb, redis', verbose: 'todas + fs, net, dns', description: 'Auto-instrumentações ativas' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Profiles</h1>
    <p class="text-body-1 mb-6">
      Profiles são baselines nomeadas que controlam o nível de detalhe da telemetria.
      Cada profile define defaults para captura de body, sample ratio, instrumentações ativas e filtros de ruído.
    </p>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      <strong>Precedência:</strong> argumento programático &gt; variável de ambiente &gt; default do profile.
      Exemplo: <code>OTEL_CAPTURE_BODY=true</code> sobreescreve o profile <code>minimal</code>.
    </v-alert>

    <ProfileComparison :profiles="nodeProfiles" title="Comparação de Profiles (Node.js)" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Diferença: Span vs Log</h2>
    <v-row>
      <v-col cols="12" md="6">
        <v-card variant="outlined" color="blue" class="pa-4">
          <h3 class="text-h6 mb-2"><v-icon class="mr-1">mdi-chart-timeline-variant</v-icon> Span Attributes</h3>
          <p class="text-body-2">Controlado por <code>captureRequestBody</code> / <code>captureResponseBody</code>.</p>
          <p class="text-body-2 mt-2">O body é flattenado em atributos individuais do span:
            <code>body.name</code>, <code>body.items[0]</code>, etc.</p>
          <p class="text-body-2 mt-2">Visível em: SigNoz → Traces → Span Tags</p>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="outlined" color="green" class="pa-4">
          <h3 class="text-h6 mb-2"><v-icon class="mr-1">mdi-text-box-outline</v-icon> Log Entries</h3>
          <p class="text-body-2">Controlado por <code>logRequestBody</code> / <code>logResponseBody</code>.</p>
          <p class="text-body-2 mt-2">O body é incluído no log Pino como atributos flattenados.
            Independente do span — pode ter body nos logs mas NÃO nos spans (e vice-versa).</p>
          <p class="text-body-2 mt-2">Visível em: SigNoz → Logs + Console (docker logs)</p>
        </v-card>
      </v-col>
    </v-row>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Exemplos de Configuração</h2>

    <h3 class="text-h6 mb-2">Minimal com body capture via env</h3>
    <CodeBlock language="bash" :code="`# Profile minimal, mas com body capture ativo via env override
OTEL_PROFILE=minimal
OTEL_CAPTURE_BODY=true
OTEL_CAPTURE_RESPONSE=true`" />

    <h3 class="text-h6 mb-2 mt-4">Standard sem body nos logs para rotas pesadas</h3>
    <CodeBlock language="bash" :code="`OTEL_PROFILE=standard
OTEL_LOG_BODY_IGNORE_ROUTES=upload,import,bulk`" />

    <h3 class="text-h6 mb-2 mt-4">Body nos logs apenas para rotas específicas</h3>
    <CodeBlock language="bash" :code="`OTEL_PROFILE=minimal
OTEL_LOG_BODY_ONLY_ROUTES=checkout,payment,order`" />
  </div>
</template>
