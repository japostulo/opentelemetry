import type { Span } from '@opentelemetry/api';
import type { LogDestination } from '../logger/types';
import type {
  ExpressIgnoreLayer,
  OtelProfileName,
  ResolvedProfile,
} from './profile';

export interface OtelConfig {
  /**
   * The service name reported in traces, metrics, and logs.
   */
  serviceName: string;

  /**
   * Deployment environment (e.g. 'local', 'dev', 'staging', 'production').
   * @default OTEL_ENVIRONMENT || APP_ENV || 'local'
   */
  environment?: string;

  /**
   * OTLP HTTP endpoint for all exporters (traces, metrics, logs).
   * When running inside Docker, defaults to http://host.docker.internal:4318.
   */
  otlpEndpoint?: string;

  /**
   * Service version reported as `service.version` resource attribute.
   * @default npm_package_version || 'unknown'
   */
  serviceVersion?: string;

  /**
   * Enable OpenTelemetry diagnostic console logging.
   * @default OTEL_DEBUG === 'true'
   */
  debug?: boolean;

  /**
   * Where to route logs. Controls whether BatchLogRecordProcessor is created.
   * @default reads from LOG_DESTINATION env, fallback 'both'
   */
  logDestination?: LogDestination;

  /**
   * Interval in milliseconds for periodic metric exports.
   * @default 30000
   */
  metricExportIntervalMs?: number;

  // ── Profile-driven knobs ─────────────────────────────────────────────

  /**
   * Named profile that selects a noise-reduction baseline:
   * - `minimal` (default): only HTTP server inbound + DB + errors. Static
   *   assets, health/metrics, Express middleware spans are dropped.
   * - `standard`: minimal + body/response capture.
   * - `verbose`: legacy "everything on" behaviour.
   *
   * Overridable via `OTEL_PROFILE` env var.
   */
  profile?: OtelProfileName;

  /**
   * Head-based sampler ratio for `ParentBased(TraceIdRatioBased)`.
   * Range 0..1. Defaults: 1.0 in dev/local, 0.2 in production.
   * Overridable via `OTEL_SAMPLE_RATIO`.
   */
  sampleRatio?: number;

  /**
   * URL paths to drop entirely (no span created) for incoming HTTP requests.
   * Strings are compiled as case-insensitive regex.
   * Merged with profile defaults and `OTEL_IGNORE_URLS` (CSV of regex).
   */
  ignoreIncomingPaths?: (string | RegExp)[];

  /**
   * URLs to drop entirely for outgoing HTTP client calls.
   * Merged with `OTEL_IGNORE_OUTGOING_URLS`.
   */
  ignoreOutgoingUrls?: (string | RegExp)[];

  /**
   * Routes to short-circuit inside the NestJS interceptor / Express
   * middleware (skip body/response capture and request/response logs).
   * Merged with `OTEL_IGNORE_ROUTES`.
   */
  ignoreRoutes?: (string | RegExp)[];

  /**
   * Express layers whose spans should be dropped. Default in `minimal`:
   * `['middleware', 'router']`.
   */
  expressIgnoreLayers?: ExpressIgnoreLayer[];

  /**
   * Whether the framework interceptor flattens the request body into span
   * attributes. Default depends on profile (`false` in minimal).
   */
  captureRequestBody?: boolean;

  /**
   * Whether the framework interceptor flattens the response body into span
   * attributes. Default depends on profile (`false` in minimal).
   */
  captureResponseBody?: boolean;

  /**
   * Whether to include the request body in Pino log entries.
   * This is independent of `captureRequestBody` which controls span attributes.
   * Default: `true` in all profiles.
   *
   * Overridable via `OTEL_LOG_REQUEST_BODY`.
   */
  logRequestBody?: boolean;

  /**
   * Whether to include the response body in Pino log entries.
   * This is independent of `captureResponseBody` which controls span attributes.
   * Default: `true` in all profiles.
   *
   * Overridable via `OTEL_LOG_RESPONSE_BODY`.
   */
  logResponseBody?: boolean;

  /**
   * Routes where body/response will NOT be included in log entries, even if
   * `logRequestBody` / `logResponseBody` are true. Useful for high-traffic or
   * sensitive endpoints.
   *
   * Strings are compiled as case-insensitive regex. Merged with
   * `OTEL_LOG_BODY_IGNORE_ROUTES` (CSV of regex).
   */
  logBodyIgnoreRoutes?: (string | RegExp)[];

  /**
   * If non-empty, ONLY these routes will have body/response included in log
   * entries. This takes precedence over `logBodyIgnoreRoutes`.
   *
   * Strings are compiled as case-insensitive regex. Merged with
   * `OTEL_LOG_BODY_ONLY_ROUTES` (CSV of regex).
   */
  logBodyOnlyRoutes?: (string | RegExp)[];

  /**
   * Per-instrumentation toggles. Each entry overrides the profile default.
   * Override individually via `OTEL_TRACE_<NAME>` env vars.
   */
  instrumentations?: Partial<ResolvedProfile['instrumentations']>;

  /**
   * @deprecated Use `instrumentations` per-name toggles instead. When given,
   * each entry is mapped to `instrumentations[name] = false`.
   */
  disabledInstrumentations?: string[];

  /**
   * Hook called for every incoming HTTP request. Use it to add custom
   * attributes to the HTTP span.
   */
  httpRequestHook?: (span: Span, request: unknown) => void;

  /**
   * Extra OTel resource attributes merged with the defaults.
   */
  additionalResourceAttributes?: Record<string, string>;
}

/** @deprecated Use {@link OtelConfig} */
export type HaocTelemetryConfig = OtelConfig;
