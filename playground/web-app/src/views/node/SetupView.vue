<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Setup</h1>
    <p class="text-body-1 mb-6">Como integrar o pacote <code>@haocruz/opentelemetry</code> na sua aplicação Node.js.</p>

    <v-divider class="mb-6" />

    <!-- NestJS -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1" color="red">mdi-nodejs</v-icon> NestJS
    </h2>

    <h3 class="text-h6 mb-2">Opção 1: Bootstrap Automático (Recomendado)</h3>
    <p class="text-body-2 mb-3">
      <code>bootstrapHaocApp()</code> substitui o <code>NestFactory.create()</code> padrão e configura tudo automaticamente:
      tracing, logger, CORS, body parser, validation pipes e o interceptor de trace.
    </p>
    <CodeBlock language="typescript" title="main.ts" :code="`import { bootstrapHaocApp } from '@haocruz/opentelemetry/nestjs';
import { AppModule } from './app.module';

bootstrapHaocApp(AppModule, {
  serviceName: 'minha-api',
  port: 3000,
  profile: 'standard',          // ou via OTEL_PROFILE env var
  logDestination: 'both',       // 'console' | 'signoz' | 'both' | 'none'
  extraSensitiveFields: ['cpf', 'rg'],  // merge com os defaults
});`" />

    <h3 class="text-h6 mb-2 mt-4">Opção 2: Setup Manual</h3>
    <p class="text-body-2 mb-3">
      Para mais controle, use <code>setupTracing()</code> + <code>HaocLoggerModule</code> + <code>configureHaocApp()</code>.
    </p>
    <CodeBlock language="typescript" title="main.ts (manual)" :code="`// IMPORTANTE: setupTracing DEVE ser chamado antes de qualquer import do NestJS
import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'minha-api', profile: 'standard' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHaocApp } from '@haocruz/opentelemetry/nestjs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureHaocApp(app, { extraSensitiveFields: ['cpf'] });
  await app.listen(3000);
}
bootstrap();`" />

    <CodeBlock language="typescript" title="app.module.ts" :code="`import { Module } from '@nestjs/common';
import { HaocLoggerModule } from '@haocruz/opentelemetry/nestjs';

@Module({
  imports: [
    HaocLoggerModule.forRoot({
      extraSensitiveFields: ['cpf', 'rg'],
    }),
  ],
})
export class AppModule {}`" />

    <v-divider class="my-6" />

    <!-- Express -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1" color="green">mdi-nodejs</v-icon> Express
    </h2>
    <CodeBlock language="typescript" title="index.ts" :code="`// IMPORTANTE: setupTracing DEVE ser chamado ANTES de qualquer import do express
import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'minha-api', profile: 'standard' });

import express from 'express';
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';

const app = express();
app.use(express.json());
app.use(createPinoMiddleware());       // Logs estruturados via Pino
app.use(createTraceMiddleware());      // Correlação com spans OTel

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello!' });
});

app.listen(3000);`" />

    <v-divider class="my-6" />

    <!-- Docker -->
    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-docker</v-icon> Docker
    </h2>
    <p class="text-body-2 mb-3">Variáveis de ambiente obrigatórias no container:</p>
    <CodeBlock language="yaml" title="docker-compose.yml" :code="`services:
  api:
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://host.docker.internal:4318
      OTEL_SERVICE_NAME: minha-api
      OTEL_ENVIRONMENT: production
      OTEL_PROFILE: standard
      LOG_DESTINATION: both
    extra_hosts:
      - 'host.docker.internal:host-gateway'
    networks:
      - signoz-net  # mesma rede do SigNoz collector`" />

    <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
      <strong>Importante:</strong> O container precisa estar na mesma rede Docker que o SigNoz collector,
      ou usar <code>host.docker.internal</code> para se comunicar com o host.
    </v-alert>
  </div>
</template>
