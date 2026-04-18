/**
 * Controls where application logs are routed:
 *
 *  - `'both'`    — console (pino-pretty in dev / async stdout in prod) + OTLP
 *  - `'signoz'`  — OTLP only (nothing printed to container stdout)
 *  - `'console'` — container stdout only (nothing sent via OTLP)
 *  - `'none'`    — completely silent (useful in unit tests)
 */
export type LogDestination = 'both' | 'signoz' | 'console' | 'none';

export interface LoggerConfig {
  /**
   * Where to route logs. Overrides `LOG_DESTINATION` env var.
   * @default reads from LOG_DESTINATION env, fallback 'both'
   */
  destination?: LogDestination;

  /**
   * Pino log level. Overrides `LOG_LEVEL` env var.
   * @default 'debug' in dev, 'info' in production
   */
  level?: string;

  /**
   * Environment label injected as `environment` property into every log.
   * @default OTEL_ENVIRONMENT || APP_ENV || 'local'
   */
  environment?: string;

  /**
   * Extra paths to redact on top of the defaults.
   * @see {@link ../logger/redaction#DEFAULT_REDACT_PATHS}
   */
  extraRedactPaths?: string[];

  /**
   * Extra field names to treat as sensitive (lower-cased).
   * Merged with the defaults.
   */
  extraSensitiveFields?: Iterable<string>;

  /**
   * Whether to consider NODE_ENV=production.
   * @default process.env.NODE_ENV === 'production'
   */
  isProduction?: boolean;
}
