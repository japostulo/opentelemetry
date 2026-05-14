import { DynamicModule, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule, Logger } from 'nestjs-pino';
import type { LoggerConfig } from '../logger/types';
import { buildLoggerConfig } from '../logger/config';
import { mergeSensitiveFields } from '../utils/sanitize';
import { OtelInterceptor, OTEL_SENSITIVE_FIELDS } from './trace.interceptor';
import type { OtelModuleConfig } from './types';

/**
 * CORS headers required for OpenTelemetry trace propagation.
 * Spread these into your `enableCors()` call to ensure tracing works.
 *
 * @example
 * app.enableCors({
 *   allowedHeaders: [...OTEL_CORS_ALLOWED_HEADERS, 'X-My-Header'],
 *   exposedHeaders: [...OTEL_CORS_EXPOSED_HEADERS],
 * });
 */
export const OTEL_CORS_ALLOWED_HEADERS: readonly string[] = [
  'Content-Type',
  'Authorization',
  'traceparent',
  'tracestate',
  'baggage',
  'X-Request-ID',
];
/** @deprecated Use {@link OTEL_CORS_ALLOWED_HEADERS} */
export const HAOC_CORS_ALLOWED_HEADERS = OTEL_CORS_ALLOWED_HEADERS;

export const OTEL_CORS_EXPOSED_HEADERS: readonly string[] = ['X-Trace-Id'];
/** @deprecated Use {@link OTEL_CORS_EXPOSED_HEADERS} */
export const HAOC_CORS_EXPOSED_HEADERS = OTEL_CORS_EXPOSED_HEADERS;

/**
 * Token that stores the resolved CORS config so the consumer can call
 * `OtelModule.getCorsHeaders()` in their bootstrap if needed.
 */
export const OTEL_CORS_CONFIG = 'OTEL_CORS_CONFIG';
/** @deprecated Use {@link OTEL_CORS_CONFIG} */
export const HAOC_CORS_CONFIG = OTEL_CORS_CONFIG;

export interface CorsConfig {
  allowedHeaders: string[];
  exposedHeaders: string[];
}
/** @deprecated Use {@link CorsConfig} */
export type HaocCorsConfig = CorsConfig;

/**
 * NestJS module that sets up the full OpenTelemetry observability stack:
 *
 * 1. Structured Pino logger (via `nestjs-pino`)
 * 2. Global `OtelInterceptor` for request/response tracing
 * 3. CORS header constants for `X-Trace-Id` propagation
 * 4. Automatic `app.useLogger()` via Logger export
 *
 * **Usage — one line in your AppModule:**
 * ```ts
 * @Module({ imports: [OtelModule.forRoot()] })
 * export class AppModule {}
 * ```
 *
 * **With custom sensitive fields:**
 * ```ts
 * OtelModule.forRoot({ extraSensitiveFields: ['cpf', 'rg'] })
 * ```
 */
export class OtelModule {
  /**
   * Registers the full OTel observability module.
   */
  static forRoot(config?: OtelModuleConfig): DynamicModule {
    const { pinoOptions, stream } = buildLoggerConfig(config) as {
      pinoOptions: Record<string, unknown>;
      stream?: NodeJS.WritableStream;
    };

    const pinoHttp = stream
      ? ([pinoOptions, stream] as unknown)
      : pinoOptions;

    const providers: Provider[] = [];

    // ── Sensitive fields (for TraceInterceptor) ───────────────────────
    const sensitiveFields = config?.extraSensitiveFields?.length
      ? mergeSensitiveFields(config.extraSensitiveFields)
      : undefined; // undefined = interceptor uses defaults

    providers.push({
      provide: OTEL_SENSITIVE_FIELDS,
      useValue: sensitiveFields,
    });

    // ── Global TraceInterceptor ─────────────────────────────────────
    if (!config?.disableTraceInterceptor) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useClass: OtelInterceptor,
      });
    }

    // ── CORS config ─────────────────────────────────────────────────
    const corsConfig: CorsConfig = {
      allowedHeaders: [
        ...OTEL_CORS_ALLOWED_HEADERS,
        ...(config?.extraAllowedHeaders ?? []),
      ],
      exposedHeaders: [
        ...OTEL_CORS_EXPOSED_HEADERS,
        ...(config?.extraExposedHeaders ?? []),
      ],
    };

    providers.push({
      provide: OTEL_CORS_CONFIG,
      useValue: corsConfig,
    });

    const loggerModule = LoggerModule.forRoot({ pinoHttp } as never);

    return {
      module: OtelModule,
      imports: [loggerModule],
      providers,
      exports: [loggerModule, OTEL_CORS_CONFIG, OTEL_SENSITIVE_FIELDS],
      global: true,
    };
  }

  /**
   * Returns the default CORS headers config — useful if the consumer
   * wants to build their own enableCors() call but still include the
   * tracing headers.
   */
  static getCorsHeaders(config?: OtelModuleConfig): CorsConfig {
    return {
      allowedHeaders: [
        ...OTEL_CORS_ALLOWED_HEADERS,
        ...(config?.extraAllowedHeaders ?? []),
      ],
      exposedHeaders: [
        ...OTEL_CORS_EXPOSED_HEADERS,
        ...(config?.extraExposedHeaders ?? []),
      ],
    };
  }
}

/**
 * Convenience function that returns the full nestjs-pino `Params` object.
 */
export function buildLoggerModuleParams(config?: LoggerConfig) {
  const { pinoOptions, stream } = buildLoggerConfig(config) as {
    pinoOptions: Record<string, unknown>;
    stream?: NodeJS.WritableStream;
  };

  const pinoHttp = stream
    ? ([pinoOptions, stream] as unknown)
    : pinoOptions;

  return { pinoHttp };
}

/** @deprecated Use {@link OtelModule} instead. */
export const HaocLoggerModule = OtelModule;

