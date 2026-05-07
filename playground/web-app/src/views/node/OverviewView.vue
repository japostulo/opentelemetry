<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">@haocruz/opentelemetry</h1>
    <v-chip size="small" color="primary" variant="flat" class="mb-4">Node.js</v-chip>
    <v-chip size="small" variant="outlined" class="ml-2 mb-4">v1.2.0</v-chip>

    <p class="text-body-1 mb-6">
      SDK de observabilidade completo para aplicações Node.js (NestJS e Express).
      Fornece tracing distribuído, logs estruturados via Pino, captura de body com redação de dados sensíveis,
      identidade de usuário e métricas — tudo integrado com SigNoz via OTLP.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Funcionalidades</h2>
    <v-row>
      <v-col cols="12" md="6">
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-chart-timeline-variant">
            <v-list-item-title>Tracing distribuído automático</v-list-item-title>
            <v-list-item-subtitle>HTTP, DB (pg, mysql, mongodb, redis), gRPC</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-text-box-outline">
            <v-list-item-title>Logs estruturados (Pino)</v-list-item-title>
            <v-list-item-subtitle>Console, SigNoz ou ambos — configurável por destino</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-shield-lock-outline">
            <v-list-item-title>Redação automática de dados sensíveis</v-list-item-title>
            <v-list-item-subtitle>password, token, CPF — dupla proteção (span + log)</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-col>
      <v-col cols="12" md="6">
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-account-outline">
            <v-list-item-title>Identidade de usuário</v-list-item-title>
            <v-list-item-subtitle>haoc.user.id, role, type — propagados automaticamente</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-tune-vertical">
            <v-list-item-title>3 Profiles de ruído</v-list-item-title>
            <v-list-item-subtitle>minimal, standard, verbose — com override por env var</v-list-item-subtitle>
          </v-list-item>
          <v-list-item prepend-icon="mdi-arrow-decision-outline">
            <v-list-item-title>Captura de Request/Response Body</v-list-item-title>
            <v-list-item-subtitle>Controlado por profile e env var, com flatten para span attributes</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Quick Start</h2>

    <h3 class="text-h6 mb-2">Instalação</h3>
    <CodeBlock language="bash" title="npm" code="npm install @haocruz/opentelemetry" />

    <h3 class="text-h6 mb-2 mt-4">NestJS (Bootstrap Automático)</h3>
    <CodeBlock language="typescript" title="main.ts" :code="`import { bootstrapHaocApp } from '@haocruz/opentelemetry/nestjs';
import { AppModule } from './app.module';

bootstrapHaocApp(AppModule, {
  serviceName: 'minha-api',
  port: 3000,
  profile: 'minimal',
});`" />

    <h3 class="text-h6 mb-2 mt-4">Express (Setup Manual)</h3>
    <CodeBlock language="typescript" title="index.ts" :code="`import { setupTracing } from '@haocruz/opentelemetry';
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';
import express from 'express';

// DEVE ser chamado ANTES de qualquer import do express
setupTracing({ serviceName: 'minha-api', profile: 'minimal' });

const app = express();
app.use(express.json());
app.use(createPinoMiddleware());
app.use(createTraceMiddleware());

app.get('/hello', (req, res) => res.json({ message: 'Hello!' }));
app.listen(3000);`" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Arquitetura</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <pre class="text-caption" style="font-family: monospace; line-height: 1.6;">
┌─────────────────────────────────────────────────────────┐
│                    Aplicação Node.js                    │
│                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ setupTracing │  │ HaocTrace     │  │ Pino Logger  │ │
│  │   (SDK)      │  │ Interceptor/  │  │  (structured │ │
│  │              │  │ Middleware    │  │   logs)      │ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          OTLP Exporters (HTTP/gRPC)             │   │
│  └─────────────────────┬───────────────────────────┘   │
└────────────────────────┼───────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │    SigNoz    │
                  │  (Traces +   │
                  │   Logs)      │
                  └──────────────┘</pre>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Imports Disponíveis</h2>
    <v-table density="comfortable" class="mb-4">
      <thead>
        <tr>
          <th>Import</th>
          <th>Conteúdo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>@haocruz/opentelemetry</code></td>
          <td>Core: <code>setupTracing</code>, <code>setUser</code>, <code>getUser</code>, re-export do <code>@opentelemetry/api</code></td>
        </tr>
        <tr>
          <td><code>@haocruz/opentelemetry/nestjs</code></td>
          <td><code>bootstrapHaocApp</code>, <code>HaocLoggerModule</code>, <code>HaocTraceInterceptor</code>, <code>configureHaocApp</code></td>
        </tr>
        <tr>
          <td><code>@haocruz/opentelemetry/express</code></td>
          <td><code>createTraceMiddleware</code>, <code>createPinoMiddleware</code></td>
        </tr>
        <tr>
          <td><code>@haocruz/opentelemetry/types</code></td>
          <td>TypeScript types: <code>HaocTelemetryConfig</code>, <code>LoggerConfig</code>, <code>HaocUserIdentity</code></td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>
