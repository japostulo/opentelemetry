<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Logging</h1>
    <p class="text-body-1 mb-6">
      O pacote fornece um Monolog Handler (<code>OtelHandler</code>) que envia logs via OTLP/HTTP para o SigNoz,
      e um canal factory (<code>OtelLogChannelFactory</code>) para integrar com o sistema de logging do Laravel.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">OtelHandler</h2>
    <v-card variant="outlined" class="mb-4 pa-4">
      <code class="text-h6 text-primary">Haoc\OpenTelemetry\Logging\OtelHandler</code>
      <p class="text-body-2 mt-2">Extends <code>Monolog\Handler\AbstractProcessingHandler</code></p>
    </v-card>
    <p class="text-body-2 mb-3">
      Converte cada log record em formato OTLP e faz POST para <code>{endpoint}/v1/logs</code>.
      Mapeia severity levels do Monolog para OTLP severity numbers.
    </p>

    <v-table density="compact" class="mb-6">
      <thead><tr><th>Monolog Level</th><th>OTLP SeverityNumber</th><th>OTLP SeverityText</th></tr></thead>
      <tbody>
        <tr><td>DEBUG (100)</td><td>5</td><td>DEBUG</td></tr>
        <tr><td>INFO (200)</td><td>9</td><td>INFO</td></tr>
        <tr><td>WARNING (300)</td><td>13</td><td>WARN</td></tr>
        <tr><td>ERROR (400)</td><td>17</td><td>ERROR</td></tr>
        <tr><td>CRITICAL (500)</td><td>21</td><td>FATAL</td></tr>
      </tbody>
    </v-table>

    <h2 class="text-h5 font-weight-bold mb-3">OtelLogChannelFactory</h2>
    <v-card variant="outlined" class="mb-4 pa-4">
      <code class="text-h6 text-primary">Haoc\OpenTelemetry\Logging\OtelLogChannelFactory</code>
      <p class="text-body-2 mt-2">Implements <code>__invoke(array $config): Logger</code></p>
    </v-card>
    <p class="text-body-2 mb-3">Factory usada pelo Laravel para criar o canal de log <code>otel</code>:</p>
    <CodeBlock language="php" title="config/logging.php" :code="`'otel' => [
    'driver' => 'custom',
    'via'    => \\Haoc\\OpenTelemetry\\Logging\\OtelLogChannelFactory::class,
    'level'  => env('LOG_LEVEL', 'info'),
],`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">LOG_DESTINATION</h2>
    <v-table density="comfortable" class="mb-6">
      <thead>
        <tr><th>Valor</th><th>stderr</th><th>SigNoz (otel)</th><th>Implementação</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>both</code> <v-chip size="x-small" color="info" variant="flat">default</v-chip></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td>Stack channels: <code>['stderr', 'otel']</code></td>
        </tr>
        <tr>
          <td><code>console</code></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td>Stack channels: <code>['stderr']</code></td>
        </tr>
        <tr>
          <td><code>signoz</code></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td><v-icon color="success" size="small">mdi-check-circle</v-icon></td>
          <td>Stack channels: <code>['otel']</code></td>
        </tr>
        <tr>
          <td><code>none</code></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td><v-icon color="grey" size="small">mdi-close-circle-outline</v-icon></td>
          <td>Stack channels: <code>[]</code> (array vazio)</td>
        </tr>
      </tbody>
    </v-table>

    <CodeBlock language="php" title="logging.php — Stack dinâmico" :code="`'stack' => [
    'driver' => 'stack',
    'channels' => match(env('LOG_DESTINATION', 'both')) {
        'console' => ['stderr'],
        'signoz'  => ['otel'],
        'none'    => [],
        default   => ['stderr', 'otel'],
    },
],`" />

    <v-alert type="info" variant="tonal" density="compact" class="mt-4">
      <strong>Diferença do Node.js:</strong> No Laravel, LOG_DESTINATION controla os canais do Monolog stack.
      No Node.js, controla os streams de destino do Pino. O resultado final é o mesmo: logs vão para o(s) destino(s) configurado(s).
    </v-alert>
  </div>
</template>
