<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">haoc/opentelemetry-laravel</h1>
    <v-chip size="small" color="red-darken-1" variant="flat" class="mb-4">PHP / Laravel</v-chip>
    <v-chip size="small" variant="outlined" class="ml-2 mb-4">v1.0.0</v-chip>

    <p class="text-body-1 mb-6">
      Pacote de observabilidade para Laravel 11+. Fornece middleware de tracing HTTP, Monolog handler OTLP,
      captura de body com sanitização de dados sensíveis e propagação de contexto W3C.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Funcionalidades</h2>
    <v-row>
      <v-col cols="12" md="6">
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-chart-timeline-variant">
            <v-list-item-title>HTTP Tracing (Middleware)</v-list-item-title>
            <v-list-item-subtitle>Cada request cria um span com atributos HTTP</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-text-box-outline">
            <v-list-item-title>Logs via OTLP (Monolog Handler)</v-list-item-title>
            <v-list-item-subtitle>Envia logs Laravel diretamente para SigNoz</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-shield-lock-outline">
            <v-list-item-title>Sanitização automática</v-list-item-title>
            <v-list-item-subtitle>Campos sensíveis substituídos por [REDACTED]</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-col>
      <v-col cols="12" md="6">
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-arrow-decision-outline">
            <v-list-item-title>Request + Response Body Capture</v-list-item-title>
            <v-list-item-subtitle>Flatten de JSON como span attributes</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-tune-vertical">
            <v-list-item-title>3 Profiles</v-list-item-title>
            <v-list-item-subtitle>minimal, standard, verbose com override por env</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-link-variant">
            <v-list-item-title>W3C Trace Context Propagation</v-list-item-title>
            <v-list-item-subtitle>Extrai traceparent/baggage do request header</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Quick Start</h2>
    <CodeBlock language="bash" title="Instalação via Composer" code="composer require haoc/opentelemetry-laravel" />

    <CodeBlock language="bash" title="Publicar configuração" code="php artisan vendor:publish --tag=haoc-otel-config" />

    <CodeBlock language="bash" title=".env" :code="`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=minha-api-laravel
OTEL_PROFILE=standard
LOG_DESTINATION=both`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Arquitetura</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
┌─────────────────────────────────────────────────────────┐
│                   Laravel Application                   │
│                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ TraceRequest │  │ OtelHandler   │  │ haoc-otel    │ │
│  │ Middleware   │  │ (Monolog)     │  │ config       │ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          HTTP POST → /v1/traces, /v1/logs       │   │
│  └─────────────────────┬───────────────────────────┘   │
└────────────────────────┼───────────────────────────────┘
                         │ OTLP/HTTP (JSON protobuf)
                         ▼
                  ┌──────────────┐
                  │    SigNoz    │
                  │  Collector   │
                  └──────────────┘</pre>
    </v-card>

    <v-alert type="info" variant="tonal" density="compact">
      <strong>Nota:</strong> Diferente do Node.js que usa SDK oficial OpenTelemetry PHP (que é experimental),
      o pacote Laravel implementa tracing e logs diretamente via HTTP OTLP JSON, sem depender do SDK PHP.
    </v-alert>
  </div>
</template>
