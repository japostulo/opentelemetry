<?php

return [
    'service_name' => env('OTEL_SERVICE_NAME', 'playground-laravel'),
    'environment' => env('OTEL_ENVIRONMENT', env('APP_ENV', 'local')),
    'endpoint' => env('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://host.docker.internal:4318'),
    'sensitive_fields' => [
        'password', 'senha', 'secret', 'token', 'access_token',
        'refresh_token', 'authorization', 'cpf', 'rg',
    ],
];
