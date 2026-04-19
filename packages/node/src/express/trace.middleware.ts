import type { Request, Response, NextFunction } from 'express';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import pinoHttp from 'pino-http';

import { flattenToSpan, flattenToRecord, type AttrRecord } from '../utils/flatten';
import { hasContent } from '../utils/stringify';
import {
  DEFAULT_SENSITIVE_FIELDS,
  mergeSensitiveFields,
} from '../utils/sanitize';
import { buildLoggerConfig } from '../logger/config';
import type { LoggerConfig } from '../logger/types';

export interface TraceMiddlewareOptions {
  /**
   * Extra field names to treat as sensitive (merged with defaults).
   */
  extraSensitiveFields?: Iterable<string>;
}

/**
 * Creates an Express middleware that correlates every request/response with
 * the active OpenTelemetry span and produces structured Pino log entries.
 *
 * This is the Express equivalent of {@link HaocTraceInterceptor} for NestJS.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { setupTracing } from '@haocruz/opentelemetry';
 * import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';
 *
 * setupTracing({ serviceName: 'my-express-api' });
 *
 * const app = express();
 * app.use(createPinoMiddleware());
 * app.use(createTraceMiddleware());
 * ```
 */
export function createTraceMiddleware(options?: TraceMiddlewareOptions) {
  const sensitiveFields = options?.extraSensitiveFields
    ? mergeSensitiveFields(options.extraSensitiveFields)
    : DEFAULT_SENSITIVE_FIELDS;

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    if (spanContext) {
      res.setHeader('X-Trace-Id', spanContext.traceId);
    }

    const route: string = req.route?.path || req.path;
    const method: string = req.method;
    const traceId = spanContext?.traceId || 'none';

    const rawBody = hasContent(req.body) ? req.body : undefined;
    const rawQuery = hasContent(req.query) ? req.query : undefined;
    const rawParams = hasContent(req.params) ? req.params : undefined;

    // ── Span attributes ───────────────────────────────────────────────
    if (activeSpan) {
      activeSpan.setAttribute('http.route', route);
      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      if (rawQuery) flattenToSpan(activeSpan, 'query', rawQuery, 0, sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'params', rawParams, 0, sensitiveFields);
      if (rawBody) flattenToSpan(activeSpan, 'body', rawBody, 0, sensitiveFields);
    }

    // ── Request log ───────────────────────────────────────────────────
    const reqAttrs: AttrRecord = {
      'http.method': method,
      'http.route': route,
    };
    if (rawQuery) flattenToRecord(reqAttrs, 'query', rawQuery, 0, sensitiveFields);
    if (rawParams) flattenToRecord(reqAttrs, 'params', rawParams, 0, sensitiveFields);
    if (rawBody) flattenToRecord(reqAttrs, 'body', rawBody, 0, sensitiveFields);

    // Use pino-http's logger attached to req if available, else console
    const logger = (req as unknown as { log?: { info: Function; error: Function } }).log;
    logger?.info(reqAttrs, `${method} ${route} [${traceId}]`);

    // ── Response hook ─────────────────────────────────────────────────
    const originalEnd = res.end;
    res.end = function (this: Response, ...args: unknown[]) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      if (activeSpan) {
        activeSpan.setAttribute('http.status_code', statusCode);
        activeSpan.setAttribute('http.duration_ms', duration);
        if (statusCode >= 500) {
          activeSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${statusCode}`,
          });
        }
      }

      const resAttrs: AttrRecord = {
        'http.method': method,
        'http.route': route,
        'http.status_code': statusCode,
        'http.duration_ms': duration,
      };

      if (statusCode >= 400) {
        logger?.error(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
      } else {
        logger?.info(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
      }

      return originalEnd.apply(this, args as never);
    } as typeof res.end;

    next();
  };
}

/**
 * Creates a pino-http middleware pre-configured with HAOC defaults.
 *
 * @param config  Optional overrides for destination, level, redaction, etc.
 */
export function createPinoMiddleware(config?: LoggerConfig) {
  const { pinoOptions, stream } = buildLoggerConfig(config) as {
    pinoOptions: Record<string, unknown>;
    stream?: NodeJS.WritableStream;
  };

  if (stream) {
    return pinoHttp(pinoOptions as never, stream);
  }
  return pinoHttp(pinoOptions as never);
}
