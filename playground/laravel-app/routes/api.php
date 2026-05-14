<?php

use Illuminate\Support\Facades\Route;
use OpenTelemetry\API\Trace\TracerInterface;
use OpenTelemetry\API\Trace\StatusCode;
use App\Http\Middleware\RuntimeConfigMiddleware;

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

Route::get('/error-4xx', function () {
    return response()->json([
        'service' => 'laravel',
        'error' => 'Validation failed: CPF is required',
    ], 400);
});

Route::get('/error-5xx', function () {
    throw new \RuntimeException('Simulated MongoDB connection refused');
});

Route::get('/slow', function () {
    $delay = min((int) request()->query('ms', '2000'), 10000);
    usleep($delay * 1000);
    return response()->json([
        'service' => 'laravel',
        'delayed' => $delay,
    ]);
});

// ── Admin endpoints (runtime profile switching) ────────────────────────
Route::get('/admin/config', function () {
    $config = RuntimeConfigMiddleware::current();
    return response()->json(array_merge(['service' => 'laravel'], $config));
});

Route::put('/admin/config', function () {
    $body = request()->only(['profile', 'captureBody', 'captureResponse', 'logDestination', 'logPayloadMode']);
    $current = RuntimeConfigMiddleware::current();
    $merged = array_merge($current, array_filter($body, fn($v) => $v !== null));

    // Explicit null means "use profile default" for booleans
    if (array_key_exists('captureBody', $body) && $body['captureBody'] === null) {
        unset($merged['captureBody']);
    }
    if (array_key_exists('captureResponse', $body) && $body['captureResponse'] === null) {
        unset($merged['captureResponse']);
    }

    RuntimeConfigMiddleware::save($merged);

    $updated = RuntimeConfigMiddleware::current();
    return response()->json(array_merge(['service' => 'laravel'], $updated));
});

