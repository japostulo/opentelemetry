<script setup lang="ts">
import CodeBlock from '../../components/CodeBlock.vue';
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Setup</h1>
    <p class="text-body-1 mb-6">Como integrar o pacote <code>haoc/opentelemetry-laravel</code> na sua aplicação Laravel 11+.</p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">1. Instalação</h2>
    <CodeBlock language="bash" :code="`composer require haoc/opentelemetry-laravel`" />

    <h2 class="text-h5 font-weight-bold mb-3 mt-6">2. Publicar Config</h2>
    <CodeBlock language="bash" :code="`php artisan vendor:publish --tag=haoc-otel-config`" />
    <p class="text-body-2 mt-2">Cria <code>config/haoc-otel.php</code> com todos os defaults.</p>

    <h2 class="text-h5 font-weight-bold mb-3 mt-6">3. Variáveis de Ambiente</h2>
    <CodeBlock language="bash" title=".env" :code="`# Obrigatório
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=minha-api-laravel

# Opcionais
OTEL_PROFILE=standard
OTEL_CAPTURE_BODY=true
OTEL_CAPTURE_RESPONSE=true
LOG_DESTINATION=both
OTEL_ENVIRONMENT=production`" />

    <h2 class="text-h5 font-weight-bold mb-3 mt-6">4. Registrar Middleware</h2>
    <p class="text-body-2 mb-3">No Laravel 11 com bootstrap simplificado:</p>
    <CodeBlock language="php" title="bootstrap/app.php" :code="`<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Middleware;
use Haoc\\OpenTelemetry\\Middleware\\TraceRequest;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
    )
    ->withMiddleware(function (Middleware \$middleware) {
        \$middleware->api(prepend: [
            TraceRequest::class,
        ]);
    })
    ->create();`" />

    <h2 class="text-h5 font-weight-bold mb-3 mt-6">5. Configurar Logging</h2>
    <p class="text-body-2 mb-3">Adicione o canal <code>otel</code> no <code>config/logging.php</code>:</p>
    <CodeBlock language="php" title="config/logging.php" :code="`'channels' => [
    'stack' => [
        'driver' => 'stack',
        'channels' => match(env('LOG_DESTINATION', 'both')) {
            'console' => ['stderr'],
            'signoz'  => ['otel'],
            'none'    => [],
            default   => ['stderr', 'otel'],
        },
    ],

    'otel' => [
        'driver' => 'custom',
        'via'    => \\Haoc\\OpenTelemetry\\Logging\\OtelLogChannelFactory::class,
        'level'  => env('LOG_LEVEL', 'info'),
    ],

    'stderr' => [
        'driver'    => 'monolog',
        'handler'   => \\Monolog\\Handler\\StreamHandler::class,
        'with'      => ['stream' => 'php://stderr'],
        'formatter' => env('LOG_STDERR_FORMATTER'),
    ],
],`" />

    <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
      <strong>LOG_DESTINATION dinâmico:</strong> O <code>match()</code> no stack channels permite controlar
      via env var para onde os logs vão, sem precisar editar código. Mesma variável usada no Node.js.
    </v-alert>

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">
      <v-icon class="mr-1">mdi-docker</v-icon> Docker
    </h2>
    <CodeBlock language="yaml" title="docker-compose.yml" :code="`services:
  laravel-app:
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://host.docker.internal:4318
      OTEL_SERVICE_NAME: minha-api-laravel
      OTEL_ENVIRONMENT: production
      OTEL_PROFILE: standard
      LOG_DESTINATION: both
    extra_hosts:
      - 'host.docker.internal:host-gateway'`" />
  </div>
</template>
