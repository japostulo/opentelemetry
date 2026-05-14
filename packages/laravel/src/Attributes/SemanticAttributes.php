<?php

declare(strict_types=1);

namespace Haoc\OpenTelemetry\Attributes;

/**
 * OpenTelemetry Semantic Conventions (v1.24+) and HAOC institutional
 * attribute name constants.
 *
 * Mirror of packages/node/src/core/semantic-attributes.ts for PHP/Laravel.
 * Use these constants instead of raw strings to ensure consistency across
 * Node and Laravel instrumentation.
 *
 * @see https://opentelemetry.io/docs/concepts/semantic-conventions/
 */
final class SemanticAttributes
{
    // ── HTTP Server / Client spans (current semconv) ──────────────────

    /** HTTP request method: GET, POST, PUT, … */
    public const HTTP_REQUEST_METHOD = 'http.request.method';

    /** HTTP response status code: 200, 404, 500, … */
    public const HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';

    /** Matched route template, e.g. /users/{id} */
    public const HTTP_ROUTE = 'http.route';

    /** URL path component, e.g. /users/123 */
    public const URL_PATH = 'url.path';

    /** URL query string component, e.g. filter=active&page=2 */
    public const URL_QUERY = 'url.query';

    /** Full URL — use only when safe (no credentials in query string). */
    public const URL_FULL = 'url.full';

    /** Original User-Agent header value */
    public const USER_AGENT_ORIGINAL = 'user_agent.original';

    /** Server host name or IP address */
    public const SERVER_ADDRESS = 'server.address';

    /** Server port number */
    public const SERVER_PORT = 'server.port';

    /** Network protocol version, e.g. "1.1", "2" */
    public const NETWORK_PROTOCOL_VERSION = 'network.protocol.version';

    // ── Legacy aliases (old semconv, kept for backward compatibility) ──

    /**
     * @deprecated Use {@see HTTP_REQUEST_METHOD}.
     * Kept for backward compatibility with existing ClickHouse queries.
     */
    public const HTTP_METHOD_LEGACY = 'http.method';

    /**
     * @deprecated Use {@see HTTP_RESPONSE_STATUS_CODE}.
     * Kept for backward compatibility with existing ClickHouse queries.
     */
    public const HTTP_STATUS_CODE_LEGACY = 'http.status_code';

    // ── HAOC institutional attributes ─────────────────────────────────

    /** Active observability profile: minimal | standard | verbose */
    public const HAOC_PROFILE = 'otel.profile';

    /** Boolean: true when the span represents an HTTP OPTIONS preflight */
    public const HAOC_IS_PREFLIGHT = 'http.is_preflight';

    /** Structured event type for HAOC log records */
    public const HAOC_LOG_EVENT = 'log.event';

    /**
     * Request payload as a sanitized JSON string attribute.
     * Used in standard and verbose profiles.
     */
    public const HAOC_REQUEST_JSON = 'request.json';

    /**
     * Response payload as a sanitized JSON string attribute.
     * Used in standard and verbose profiles.
     */
    public const HAOC_RESPONSE_JSON = 'response.json';

    /** Error payload as a sanitized JSON string attribute. */
    public const HAOC_ERROR_JSON = 'error.json';

    /**
     * Clean one-line title shown in the SigNoz log list.
     * Format: "METHOD /route [traceId]" for requests,
     *         "METHOD /route STATUS DURms [traceId]" for responses.
     * Configure SigNoz columns to display this instead of body.
     */
    public const HAOC_LOG_TITLE = 'log.title';

    // ── haoc.log.event values ──────────────────────────────────────────

    public const LOG_EVENT_REQUEST   = 'http.request';
    public const LOG_EVENT_RESPONSE  = 'http.response';
    public const LOG_EVENT_ERROR     = 'http.error';
    public const LOG_EVENT_PREFLIGHT = 'http.preflight';

    /** @codeCoverageIgnore */
    private function __construct() {}
}
