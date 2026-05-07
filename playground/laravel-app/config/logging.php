<?php

/*
|--------------------------------------------------------------------------
| Log Destination Stack Builder
|--------------------------------------------------------------------------
| Dynamically selects which channels are active based on LOG_DESTINATION:
|   - 'both'    (default): stderr + otel
|   - 'console': stderr only (no OTLP)
|   - 'signoz':  otel only (no stderr)
|   - 'none':    empty stack
*/
$logDestination = env('LOG_DESTINATION', 'both');
$stackChannels = match ($logDestination) {
    'console' => ['stderr'],
    'signoz'  => ['otel'],
    'none'    => [],
    default   => ['stderr', 'otel'], // 'both'
};

return [
    'default' => env('LOG_CHANNEL', 'stack'),
    'channels' => [
        'stack' => [
            'driver' => 'stack',
            'channels' => $stackChannels,
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
