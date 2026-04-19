import type { Span } from '@opentelemetry/api';
import type { LogDestination } from '../logger/types';
import type {
  ExpressIgnoreLayer,
  HaocProfileName,
  ResolvedProfile,
} from './profile';

export interface HaocTelemetryConfig {
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
   * Overridable via `HAOC_OTEL_PROFILE` env var.
   */
  profile?: HaocProfileName;

  /**
   * Head-based sampler ratio for `ParentBased(TraceIdRatioBased)`.
   * Range 0..1. Defaults: 1.0 in dev/local, 0.2 in production.
   * Overridable via `HAOC_OTEL_SAMPLE_RATIO`.
   */
  sampleRatio?: number;

  /**
   * URL paths to drop entirely (no span created) for incoming HTTP requests.
   * Strings are compiled as case-insensitive regex.
   * Merged with profile defaults and `HAOC_OTEL_IGNORE_URLS` (CSV of regex).
   */
  ignoreIncomingPaths?: (string | RegExp)[];

  /**
   * URLs to drop entirely for outgoing HTTP client calls.
   * Merged with `HAOC_OTEL_IGNORE_OUTGOING_URLS`.
   */
  ignoreOutgoingUrls?: (string | RegExp)[];

  /**
   * Routes to short-circuit inside the NestJS interceptor / Express
   * middleware (skip body/response capture and request/response logs).
   * Merged with `HAOC_OTEL_IGNORE_ROUTES`.
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
   * Per-instrumentation toggles. Each entry overrides the profile default.
   * Override individually via `HAOC_OTEL_TRACE_<NAME>` env vars.
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
