<?php

use Illuminate\Support\Facades\Route;
use OpenTelemetry\API\Trace\TracerInterface;

Route::get('/hello', function (TracerInterface $tracer) {
    $span = $tracer->spanBuilder('GET /api/hello')->startSpan();
    $traceId = $span->getContext()->getTraceId();
    $span->end();

    return response()->json([
        'service' => 'laravel',
        'traceId' => $traceId,
        'message' => 'Hello from Laravel playground!',
    ]);
});

Route::post('/echo', function () {
    $body = request()->all();

    return response()->json([
        'service' => 'laravel',
        'received' => $body,
    ]);
});
