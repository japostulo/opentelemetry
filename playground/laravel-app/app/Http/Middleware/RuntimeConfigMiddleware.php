<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;

class RuntimeConfigMiddleware
{
    private static string $configPath = '/tmp/haoc-runtime-config.json';

    public function handle(Request $request, Closure $next)
    {
        if (file_exists(self::$configPath)) {
            $raw = @file_get_contents(self::$configPath);
            if ($raw !== false) {
                $config = json_decode($raw, true);
                if (is_array($config)) {
                    if (isset($config['profile'])) {
                        Config::set('otel.profile', $config['profile']);
                    }
                    if (array_key_exists('captureBody', $config)) {
                        Config::set('otel.capture_request_body', (bool) $config['captureBody']);
                    }
                    if (array_key_exists('captureResponse', $config)) {
                        Config::set('otel.capture_response_body', (bool) $config['captureResponse']);
                    }
                    if (isset($config['logDestination'])) {
                        Config::set('otel.log_destination', $config['logDestination']);
                    }
                    if (isset($config['logPayloadMode'])) {
                        Config::set('otel.log_payload_mode', $config['logPayloadMode']);
                    }
                }
            }
        }

        // Ensure the next resolution of `Profile` reflects the freshly
        // applied Config values. The package now binds Profile as a
        // transient, so the TraceRequest middleware (resolved after this
        // one) gets a Profile built from the up-to-date config.
        app()->forgetInstance(\Haoc\OpenTelemetry\Profile::class);

        return $next($request);
    }

    /**
     * Read the current runtime config from file, merging with env defaults.
     */
    public static function current(): array
    {
        $defaults = [
            'profile'         => env('OTEL_PROFILE', 'minimal'),
            'captureBody'     => env('OTEL_CAPTURE_BODY') !== null
                                    ? filter_var(env('OTEL_CAPTURE_BODY'), FILTER_VALIDATE_BOOLEAN)
                                    : null,
            'captureResponse' => env('OTEL_CAPTURE_RESPONSE') !== null
                                    ? filter_var(env('OTEL_CAPTURE_RESPONSE'), FILTER_VALIDATE_BOOLEAN)
                                    : null,
            'logDestination'  => env('LOG_DESTINATION', 'both'),
            'logPayloadMode'  => env('OTEL_LOG_PAYLOAD_MODE', null),
        ];

        if (!file_exists(self::$configPath)) {
            return $defaults;
        }

        $raw = @file_get_contents(self::$configPath);
        if ($raw === false) {
            return $defaults;
        }

        $saved = json_decode($raw, true);
        if (!is_array($saved)) {
            return $defaults;
        }

        return array_merge($defaults, array_intersect_key($saved, $defaults));
    }

    /**
     * Persist the given config to the runtime config file.
     */
    public static function save(array $config): void
    {
        file_put_contents(self::$configPath, json_encode($config, JSON_PRETTY_PRINT));
    }
}
