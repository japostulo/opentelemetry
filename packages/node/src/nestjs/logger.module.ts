import { DynamicModule, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule, Logger } from 'nestjs-pino';
import type { LoggerConfig } from '../logger/types';
import { buildLoggerConfig } from '../logger/config';
import { mergeSensitiveFields } from '../utils/sanitize';
import { HaocTraceInterceptor, HAOC_SENSITIVE_FIELDS } from './trace.interceptor';
import type { HaocModuleConfig } from './types';

/**
 * CORS headers required for OpenTelemetry trace propagation.
 * Spread these into your `enableCors()` call to ensure tracing works.
 *
 * @example
 * app.enableCors({
 *   allowedHeaders: [...HAOC_CORS_ALLOWED_HEADERS, 'X-My-Header'],
 *   exposedHeaders: [...HAOC_CORS_EXPOSED_HEADERS],
 * });
 */
export const HAOC_CORS_ALLOWED_HEADERS: readonly string[] = [
  'Content-Type',
  'Authorization',
  'traceparent',
  'tracestate',
  'baggage',
  'X-Request-ID',
];
export const HAOC_CORS_EXPOSED_HEADERS: readonly string[] = ['X-Trace-Id'];

/**
 * Token that stores the resolved CORS config so the consumer can call
 * `HaocLoggerModule.getCorsHeaders()` in their bootstrap if needed.
 */
export const HAOC_CORS_CONFIG = 'HAOC_CORS_CONFIG';

export interface HaocCorsConfig {
  allowedHeaders: string[];
  exposedHeaders: string[];
}

/**
 * NestJS module that sets up the full HAOC observability stack:
 *
 * 1. Structured Pino logger (via `nestjs-pino`)
 * 2. Global `HaocTraceInterceptor` for request/response tracing
 * 3. CORS header constants for `X-Trace-Id` propagation
 * 4. Automatic `app.useLogger()` via Logger export
 *
 * **Usage — one line in your AppModule:**
 * ```ts
 * @Module({ imports: [HaocLoggerModule.forRoot()] })
 * export class AppModule {}
 * ```
 *
 * **With custom sensitive fields:**
 * ```ts
 * HaocLoggerModule.forRoot({ extraSensitiveFields: ['cpf', 'rg'] })
 * ```
 */
export class HaocLoggerModule {
  /**
   * Registers the full HAOC observability module.
   */
  static forRoot(config?: HaocModuleConfig): DynamicModule {
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
      provide: HAOC_SENSITIVE_FIELDS,
      useValue: sensitiveFields,
    });

    // ── Global TraceInterceptor ─────────────────────────────────────
    if (!config?.disableTraceInterceptor) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useClass: HaocTraceInterceptor,
      });
    }

    // ── CORS config ─────────────────────────────────────────────────
    const corsConfig: HaocCorsConfig = {
      allowedHeaders: [
        ...HAOC_CORS_ALLOWED_HEADERS,
        ...(config?.extraAllowedHeaders ?? []),
      ],
      exposedHeaders: [
        ...HAOC_CORS_EXPOSED_HEADERS,
        ...(config?.extraExposedHeaders ?? []),
      ],
    };

    providers.push({
      provide: HAOC_CORS_CONFIG,
      useValue: corsConfig,
    });

    const loggerModule = LoggerModule.forRoot({ pinoHttp } as never);

    return {
      module: HaocLoggerModule,
      imports: [loggerModule],
      providers,
      exports: [loggerModule, HAOC_CORS_CONFIG, HAOC_SENSITIVE_FIELDS],
      global: true,
    };
  }

  /**
   * Returns the default CORS headers config — useful if the consumer
   * wants to build their own enableCors() call but still include the
   * tracing headers.
   */
  static getCorsHeaders(config?: HaocModuleConfig): HaocCorsConfig {
    return {
      allowedHeaders: [
        ...HAOC_CORS_ALLOWED_HEADERS,
        ...(config?.extraAllowedHeaders ?? []),
      ],
      exposedHeaders: [
        ...HAOC_CORS_EXPOSED_HEADERS,
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

