import type { LoggerConfig } from '../logger/types';

/**
 * Configuration for {@link OtelModule.forRoot}.
 *
 * Every field is optional — sensible defaults are applied.
 */
export interface OtelModuleConfig extends LoggerConfig {
  /**
   * Extra field names to treat as sensitive in request/response flattening.
   * Merged with the library defaults (password, token, etc.).
   *
   * @example ['cpf', 'rg', 'cartao']
   */
  extraSensitiveFields?: string[];

  /**
   * Extra headers to include in CORS `allowedHeaders`.
   * The library always includes: Content-Type, Authorization, traceparent,
   * tracestate, X-Request-ID.
   */
  extraAllowedHeaders?: string[];

  /**
   * Extra headers to include in CORS `exposedHeaders`.
   * The library always includes: X-Trace-Id.
   */
  extraExposedHeaders?: string[];

  /**
   * Whether to disable auto-registration of the global TraceInterceptor.
   * @default false
   */
  disableTraceInterceptor?: boolean;
}

/** @deprecated Use {@link OtelModuleConfig} */
export type HaocModuleConfig = OtelModuleConfig;
