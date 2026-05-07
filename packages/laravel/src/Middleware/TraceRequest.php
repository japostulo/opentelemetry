<?php

namespace Haoc\OpenTelemetry\Middleware;

use Closure;
use Haoc\OpenTelemetry\Profile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenTelemetry\API\Baggage\Propagation\BaggagePropagator;
use OpenTelemetry\API\Trace\Propagation\TraceContextPropagator;
use OpenTelemetry\API\Trace\SpanKind;
use OpenTelemetry\API\Trace\StatusCode;
use OpenTelemetry\API\Trace\TracerInterface;
use OpenTelemetry\Context\Propagation\MultiTextMapPropagator;
use Symfony\Component\HttpFoundation\Response;

class TraceRequest
{
    public function __construct(
        private TracerInterface $tracer,
        private Profile $profile,
    ) {
    }

    private const MAX_RESPONSE_BODY_SIZE = 10 * 1024; // 10KB

    public function handle(Request $request, Closure $next): Response
    {
        $route = $request->route()?->uri() ?? $request->path();
        $method = $request->method();

        // ── Short-circuit: ignored routes pass through untraced ────────
        $ignorePatterns = $this->profile->get('ignore_routes', []);
        if (Profile::matchesAny($ignorePatterns, $route)) {
            return $next($request);
        }

        $captureBody     = (bool) $this->profile->get('capture_request_body', false);
        $captureResponse = (bool) $this->profile->get('capture_response_body', false);

        $spanName = "{$method} /{$route}";

        $sensitiveFields = config('haoc-otel.sensitive_fields', []);

        // Extract W3C trace context + baggage from incoming request so this
        // span is correctly parented within the distributed trace.
        $propagator = new MultiTextMapPropagator([
            TraceContextPropagator::getInstance(),
            BaggagePropagator::getInstance(),
        ]);
        $parentContext = $propagator->extract($request->headers->all());

        $span = $this->tracer->spanBuilder($spanName)
            ->setSpanKind(SpanKind::KIND_SERVER)
            ->setParent($parentContext)
            ->startSpan();

        $scope = $span->activate();

        $span->setAttribute('http.method', $method);
        $span->setAttribute('http.route', "/{$route}");
        $span->setAttribute('http.url', $request->fullUrl());
        $span->setAttribute('http.target', $request->getRequestUri());
        $span->setAttribute('environment', config('haoc-otel.environment'));
        // Stamped per-request so runtime /admin/config flips reflect immediately.
        $span->setAttribute('haoc.otel.profile', (string) $this->profile->get('profile'));

        // ── User Identity ───────────────────────────────────────────────
        $user = $request->user();
        if ($user) {
            $span->setAttribute('haoc.user.id', (string) $user->getAuthIdentifier());
            if (method_exists($user, 'getEmail')) {
                $span->setAttribute('haoc.user.email', $user->getEmail());
            } elseif (isset($user->email)) {
                $span->setAttribute('haoc.user.email', $user->email);
            }
        }

        // ── Infrastructure / Hop Tracking ───────────────────────────────
        $forwardedFor = $request->header('X-Forwarded-For');
        if ($forwardedFor) {
            $span->setAttribute('http.x_forwarded_for', $forwardedFor);
            $hops = array_map('trim', explode(',', $forwardedFor));
            $span->setAttribute('network.hop_count', count($hops));
            $span->setAttribute('http.client_ip', $hops[0]);
        }

        $realIp = $request->header('X-Real-IP');
        if ($realIp) {
            $span->setAttribute('http.x_real_ip', $realIp);
        }

        $forwardedHost = $request->header('X-Forwarded-Host');
        if ($forwardedHost) {
            $span->setAttribute('http.x_forwarded_host', $forwardedHost);
        }

        $forwardedProto = $request->header('X-Forwarded-Proto');
        if ($forwardedProto) {
            $span->setAttribute('http.x_forwarded_proto', $forwardedProto);
        }

        $via = $request->header('Via');
        if ($via) {
            $span->setAttribute('http.via', $via);
        }

        // ── Baggage from Frontend ───────────────────────────────────────
        $baggageHeader = $request->header('baggage');
        if ($baggageHeader) {
            foreach (explode(',', $baggageHeader) as $entry) {
                $parts = explode('=', trim($entry), 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $value = urldecode(trim($parts[1]));
                    if (preg_match('/^(haoc\.|page\.|browser\.|device\.|app\.)/', $key)) {
                        $span->setAttribute($key, $value);
                    }
                }
            }
        }

        // Query params
        foreach ($this->sanitize($request->query(), $sensitiveFields) as $key => $value) {
            $span->setAttribute("haoc.request.query.{$key}", is_scalar($value) ? $value : json_encode($value));
        }

        // Route params
        foreach ($this->sanitize($request->route()?->parameters() ?? [], $sensitiveFields) as $key => $value) {
            $span->setAttribute("haoc.request.params.{$key}", is_scalar($value) ? $value : json_encode($value));
        }

        // Body (POST/PUT/PATCH) — only when profile allows
        $requestBodyAttrs = [];
        if (
            $captureBody
            && in_array($method, ['POST', 'PUT', 'PATCH'])
            && $request->isJson()
        ) {
            $requestBodyAttrs = $this->flattenAttributes('haoc.request.body', $this->sanitize($request->all(), $sensitiveFields));
            foreach ($requestBodyAttrs as $key => $value) {
                $span->setAttribute($key, $value);
            }
        }

        $traceId = $span->getContext()->getTraceId();

        Log::info("{$method} /{$route} [{$traceId}]", array_merge(
            [
                'http.method'     => $method,
                'http.route'      => "/{$route}",
                'haoc.otel.profile' => (string) $this->profile->get('profile'),
            ],
            array_map(
                fn($v) => is_scalar($v) ? $v : json_encode($v),
                $this->flattenAttributes('haoc.request.query', $this->sanitize($request->query(), $sensitiveFields))
            ),
            array_map(
                fn($v) => is_scalar($v) ? $v : json_encode($v),
                $this->flattenAttributes('haoc.request.params', $this->sanitize($request->route()?->parameters() ?? [], $sensitiveFields))
            ),
            $requestBodyAttrs
        ));

        $startTime = microtime(true);

        try {
            /** @var Response $response */
            $response = $next($request);

            $duration = round((microtime(true) - $startTime) * 1000);
            $statusCode = $response->getStatusCode();

            $span->setAttribute('http.status_code', $statusCode);
            $span->setAttribute('http.duration_ms', $duration);
            $response->headers->set('X-Trace-Id', $traceId);

            if ($statusCode >= 400) {
                $span->setStatus(StatusCode::STATUS_ERROR, "HTTP {$statusCode}");
            }

            // ── Response body capture ───────────────────────────────────
            $responseBodyAttrs = [];
            if ($captureResponse) {
                $contentType = $response->headers->get('Content-Type', '');
                $isJson = str_contains($contentType, 'application/json');
                if ($isJson) {
                    $rawContent = $response->getContent();
                    if ($rawContent !== false && strlen($rawContent) <= self::MAX_RESPONSE_BODY_SIZE) {
                        $decoded = json_decode($rawContent, true);
                        if (is_array($decoded)) {
                            $sanitized = $this->sanitize($decoded, $sensitiveFields);
                            $responseBodyAttrs = $this->flattenAttributes('haoc.response.body', $sanitized);
                            foreach ($responseBodyAttrs as $key => $value) {
                                $span->setAttribute($key, $value);
                            }
                        }
                    }
                }
            }

            $logContext = [
                'http.method' => $method,
                'http.route' => "/{$route}",
                'http.status_code' => $statusCode,
                'http.duration_ms' => $duration,
            ];
            if (!empty($responseBodyAttrs)) {
                $logContext['response'] = $responseBodyAttrs;
            }
            $logMessage = "{$method} /{$route} {$statusCode} {$duration}ms [{$traceId}]";
            if ($statusCode >= 500) {
                Log::error($logMessage, $logContext);
            } elseif ($statusCode >= 400) {
                Log::warning($logMessage, $logContext);
            } else {
                Log::info($logMessage, $logContext);
            }

            return $response;
        } catch (\Throwable $e) {
            $duration = round((microtime(true) - $startTime) * 1000);
            $statusCode = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

            $span->setAttribute('http.status_code', $statusCode);
            $span->setAttribute('http.duration_ms', $duration);
            $span->setAttribute('error.message', $e->getMessage());
            $span->setAttribute('error.type', get_class($e));
            $span->setStatus(StatusCode::STATUS_ERROR, $e->getMessage());
            $span->recordException($e);

            Log::error("{$method} /{$route} {$statusCode} {$duration}ms [{$traceId}] {$e->getMessage()}", [
                'http.method' => $method,
                'http.route' => "/{$route}",
                'http.status_code' => $statusCode,
                'http.duration_ms' => $duration,
                'error' => [
                    'message' => $e->getMessage(),
                    'type' => get_class($e),
                ],
            ]);

            throw $e;
        } finally {
            $span->end();
            $scope->detach();
        }
    }

    private function sanitize(array $data, array $sensitiveFields): array
    {
        $sanitized = [];
        foreach ($data as $key => $value) {
            if (in_array(strtolower($key), $sensitiveFields, true)) {
                $sanitized[$key] = '[REDACTED]';
            } elseif (is_array($value)) {
                $sanitized[$key] = $this->sanitize($value, $sensitiveFields);
            } else {
                $sanitized[$key] = $value;
            }
        }
        return $sanitized;
    }

    private function flattenAttributes(string $prefix, array $data, int $depth = 0): array
    {
        if ($depth > 3) {
            return [];
        }

        $result = [];
        foreach ($data as $key => $value) {
            $attrKey = "{$prefix}.{$key}";
            if (is_array($value)) {
                $result = array_merge($result, $this->flattenAttributes($attrKey, $value, $depth + 1));
            } elseif (is_bool($value)) {
                // OTel PHP SDK stores booleans in attributes_bool column
                $result[$attrKey] = $value;
            } elseif (is_int($value) || is_float($value)) {
                // Preserve numeric types for attributes_number column in ClickHouse
                $result[$attrKey] = $value;
            } elseif (is_scalar($value)) {
                $result[$attrKey] = (string) $value;
            }
        }
        return $result;
    }
}
