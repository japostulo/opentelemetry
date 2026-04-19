<?php

return [
    'default' => env('LOG_CHANNEL', 'stack'),
    'channels' => [
        'stack' => [
            'driver' => 'stack',
            'channels' => ['stderr', 'otel'],
        ],
        'stderr' => [
            'driver' => 'monolog',
            'handler' => \Monolog\Handler\StreamHandler::class,
            'with' => [
                'stream' => 'php://stderr',
            ],
            'level' => 'debug',
        ],
        'otel' => [
            'driver' => 'custom',
            'via' => \Haoc\OpenTelemetry\Logging\OtelLogChannelFactory::class,
            'level' => 'debug',
        ],
    ],
];
