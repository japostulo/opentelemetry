import type { Span } from '@opentelemetry/api';
import type { LogDestination } from '../logger/types';

export interface HaocTelemetryConfig {
  /**
   * The service name reported in traces, metrics, and logs.
   * Also used as `service.name` OTel resource attribute.
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
   * @default OTEL_EXPORTER_OTLP_ENDPOINT || 'http://host.docker.internal:4318' (Docker) || 'http://localhost:4318'
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

  /**
   * List of auto-instrumentation module short-names to disable.
   * Each entry should be the suffix after `@opentelemetry/instrumentation-`.
   * @default ['fs', 'net', 'dns']
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
