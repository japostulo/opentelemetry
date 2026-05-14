/**
 * OpenTelemetry Semantic Conventions (v1.24+) and custom
 * attribute names.
 *
 * Use these constants in middleware, interceptors, and span processors to
 * ensure consistency across Node, Web, and Laravel.
 *
 * @see https://opentelemetry.io/docs/concepts/semantic-conventions/
 */

// ── HTTP Server / Client spans (current semconv) ──────────────────────────

/** HTTP request method: GET, POST, PUT, … */
export const ATTR_HTTP_REQUEST_METHOD = 'http.request.method';

/** HTTP response status code: 200, 404, 500, … */
export const ATTR_HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';

/** Matched route template, e.g. /users/:id */
export const ATTR_HTTP_ROUTE = 'http.route';

/** URL path component, e.g. /users/123 */
export const ATTR_URL_PATH = 'url.path';

/** URL query string component, e.g. filter=active&page=2 */
export const ATTR_URL_QUERY = 'url.query';

/** Full URL — use only when safe (no credentials in query string). */
export const ATTR_URL_FULL = 'url.full';

/** Original User-Agent header value */
export const ATTR_USER_AGENT_ORIGINAL = 'user_agent.original';

/** Server host name or IP address */
export const ATTR_SERVER_ADDRESS = 'server.address';

/** Server port number */
export const ATTR_SERVER_PORT = 'server.port';

/** Network protocol version, e.g. "1.1", "2" */
export const ATTR_NETWORK_PROTOCOL_VERSION = 'network.protocol.version';

// ── Legacy aliases (old OTel semconv — kept for backward compatibility) ────

/**
 * @deprecated Use {@link ATTR_HTTP_REQUEST_METHOD}.
 * Kept for backward compatibility with existing ClickHouse queries and
 * auto-instrumentation output.
 */
export const ATTR_HTTP_METHOD_LEGACY = 'http.method';

/**
 * @deprecated Use {@link ATTR_HTTP_RESPONSE_STATUS_CODE}.
 * Kept for backward compatibility with existing ClickHouse queries.
 */
export const ATTR_HTTP_STATUS_CODE_LEGACY = 'http.status_code';

// ── Custom attributes ─────────────────────────────────────────────────────

/** Active observability profile: minimal | standard | verbose */
export const ATTR_OTEL_PROFILE = 'otel.profile';
/** @deprecated Use {@link ATTR_OTEL_PROFILE} */
export const ATTR_HAOC_PROFILE = ATTR_OTEL_PROFILE;

/** Boolean: true when the span represents an HTTP OPTIONS preflight request */
export const ATTR_HTTP_IS_PREFLIGHT = 'http.is_preflight';
/** @deprecated Use {@link ATTR_HTTP_IS_PREFLIGHT} */
export const ATTR_HAOC_IS_PREFLIGHT = ATTR_HTTP_IS_PREFLIGHT;

/** Structured event type for log records — see {@link LogEvent} */
export const ATTR_LOG_EVENT = 'log.event';
/** @deprecated Use {@link ATTR_LOG_EVENT} */
export const ATTR_HAOC_LOG_EVENT = ATTR_LOG_EVENT;

/** One-line human-readable log title for log indexing and search. */
export const ATTR_LOG_TITLE = 'log.title';
/** @deprecated Use {@link ATTR_LOG_TITLE} */
export const ATTR_HAOC_LOG_TITLE = ATTR_LOG_TITLE;

/**
 * Request payload as a sanitized JSON string attribute.
 * Used in `standard` and `verbose` profiles.
 * Set in log records; never flattened into individual attributes.
 */
export const ATTR_REQUEST_JSON = 'request.json';
/** @deprecated Use {@link ATTR_REQUEST_JSON} */
export const ATTR_HAOC_REQUEST_JSON = ATTR_REQUEST_JSON;

/**
 * Response payload as a sanitized JSON string attribute.
 * Used in `standard` and `verbose` profiles.
 */
export const ATTR_RESPONSE_JSON = 'response.json';
/** @deprecated Use {@link ATTR_RESPONSE_JSON} */
export const ATTR_HAOC_RESPONSE_JSON = ATTR_RESPONSE_JSON;

/**
 * Error payload as a sanitized JSON string attribute.
 * Set when the request fails with a structured error body.
 */
export const ATTR_ERROR_JSON = 'error.json';
/** @deprecated Use {@link ATTR_ERROR_JSON} */
export const ATTR_HAOC_ERROR_JSON = ATTR_ERROR_JSON;

// ── log.event values ──────────────────────────────────────────────────────

export type LogEvent =
  | 'http.request'
  | 'http.response'
  | 'http.error'
  | 'http.preflight';
/** @deprecated Use {@link LogEvent} */
export type HaocLogEvent = LogEvent;

export const LOG_EVENT_REQUEST: LogEvent   = 'http.request';
export const LOG_EVENT_RESPONSE: LogEvent  = 'http.response';
export const LOG_EVENT_ERROR: LogEvent     = 'http.error';
export const LOG_EVENT_PREFLIGHT: LogEvent = 'http.preflight';
