import type { Request, Response, NextFunction } from 'express';
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';
import pinoHttp from 'pino-http';

import { flattenToSpan, flattenToRecord, type AttrRecord } from '../utils/flatten';
import { hasContent, tryParseJson } from '../utils/stringify';
import {
  DEFAULT_SENSITIVE_FIELDS,
  mergeSensitiveFields,
  sanitizeNested,
} from '../utils/sanitize';
import { otelEmit } from '../logger/otel-emit';
import { getUserSpanAttributes } from '../identity';
import { buildLoggerConfig } from '../logger/config';
import type { LoggerConfig } from '../logger/types';
import { getRuntimeProfile, matchesAny, shouldLogBodyForRoute } from '../tracing/profile';

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

    // ── Profile-driven runtime decisions ─────────────────────────────
    const runtime = getRuntimeProfile();
    if (matchesAny(runtime.ignoreRoutes, route)) {
      next();
      return;
    }
    const captureBody = runtime.captureRequestBody;
    const captureResponse = runtime.captureResponseBody;

    // Log body controls (independent of span attributes)
    const routeAllowsLogBody = shouldLogBodyForRoute(runtime, route);
    const logBody = runtime.logRequestBody && routeAllowsLogBody;
    const logResponse = runtime.logResponseBody && routeAllowsLogBody;

    const rawBody = hasContent(req.body) ? req.body : undefined;
    const rawQuery = hasContent(req.query) ? req.query : undefined;
    const rawParams = hasContent(req.params) ? req.params : undefined;

    // ── Span attributes ───────────────────────────────────────────────
    if (activeSpan) {
      activeSpan.setAttribute('http.route', route);      activeSpan.setAttribute('haoc.otel.profile', runtime.profile);      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      if (rawQuery) flattenToSpan(activeSpan, 'haoc.request.query', rawQuery, 0, sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'haoc.request.params', rawParams, 0, sensitiveFields);
      if (captureBody && rawBody) flattenToSpan(activeSpan, 'haoc.request.body', rawBody, 0, sensitiveFields);

      // ── User Identity ───────────────────────────────────────────────
      const userAttrs = getUserSpanAttributes();
      for (const [key, value] of Object.entries(userAttrs)) {
        activeSpan.setAttribute(key, value);
      }

      // ── Infrastructure / Hop Tracking ───────────────────────────────
      const headers = req.headers;
      const forwardedFor = headers['x-forwarded-for'];
      if (forwardedFor) {
        const ffValue = Array.isArray(forwardedFor) ? forwardedFor.join(', ') : forwardedFor;
        activeSpan.setAttribute('http.forwarded_for', ffValue);
        activeSpan.setAttribute('network.hop_count', ffValue.split(',').length);
      }
      if (headers['x-real-ip']) {
        activeSpan.setAttribute('http.real_ip', String(headers['x-real-ip']));
      }
      if (headers['x-forwarded-host']) {
        activeSpan.setAttribute('http.forwarded_host', String(headers['x-forwarded-host']));
      }
      if (headers['x-forwarded-proto']) {
        activeSpan.setAttribute('http.forwarded_proto', String(headers['x-forwarded-proto']));
      }
      if (headers['via']) {
        activeSpan.setAttribute('http.via', String(headers['via']));
      }

      // ── Baggage from Frontend ───────────────────────────────────────
      const baggage = propagation.getBaggage(context.active());
      if (baggage) {
        for (const [key, entry] of baggage.getAllEntries()) {
          if (key.startsWith('haoc.') || key.startsWith('page.') ||
              key.startsWith('browser.') || key.startsWith('device.') ||
              key.startsWith('app.')) {
            activeSpan.setAttribute(key, entry.value);
          }
        }
      }
    }

    // ── Request log ───────────────────────────────────────────────────
    const reqAttrs: AttrRecord = {
      'http.method': method,
      'http.route': route,      'haoc.otel.profile': runtime.profile,    };
    if (rawQuery) flattenToRecord(reqAttrs, 'haoc.request.query', rawQuery, 0, sensitiveFields);
    if (rawParams) flattenToRecord(reqAttrs, 'haoc.request.params', rawParams, 0, sensitiveFields);
    if (logBody && rawBody) flattenToRecord(reqAttrs, 'haoc.request.body', rawBody, 0, sensitiveFields);

    // Use pino-http's logger attached to req if available, else console
    const logger = (req as unknown as { log?: { info: Function; error: Function } }).log;
    logger?.info(reqAttrs, `${method} ${route} [${traceId}]`);
    otelEmit('info', {
      msg: `${method} ${route} [${traceId}]`,
      req: {
        method,
        url: req.url,
        headers: {
          host: req.headers['host'],
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
        ...(rawQuery ? { query: sanitizeNested(rawQuery, sensitiveFields) as Record<string, unknown> } : {}),
        ...(logBody && rawBody ? { body: sanitizeNested(rawBody, sensitiveFields) as Record<string, unknown> } : {}),
      },
      service: process.env.OTEL_SERVICE_NAME,
      environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      requestPath: req.url,
      'haoc.otel.profile': runtime.profile,
    });

    // ── Response body buffer ─────────────────────────────────────────
    const MAX_RESPONSE_SIZE = 10 * 1024; // 10KB
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let bufferOverflow = false;

    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function (this: Response, chunk: unknown, ...rest: unknown[]) {
      if (!bufferOverflow && (captureResponse || logResponse)) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        totalSize += buf.length;
        if (totalSize <= MAX_RESPONSE_SIZE) {
          chunks.push(buf);
        } else {
          bufferOverflow = true;
          chunks.length = 0;
        }
      }
      return originalWrite.apply(this, [chunk, ...rest] as never);
    } as typeof res.write;

    res.end = function (this: Response, ...args: unknown[]) {
      // Capture final chunk if present
      const firstArg = args[0];
      if (!bufferOverflow && (captureResponse || logResponse) && firstArg && typeof firstArg !== 'function') {
        const buf = Buffer.isBuffer(firstArg) ? firstArg : Buffer.from(String(firstArg));
        totalSize += buf.length;
        if (totalSize <= MAX_RESPONSE_SIZE) {
          chunks.push(buf);
        } else {
          bufferOverflow = true;
          chunks.length = 0;
        }
      }

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

      // ── Parse buffered response body ──────────────────────────────
      let parsedResponseBody: unknown;
      if (!bufferOverflow && chunks.length > 0) {
        const contentType = res.getHeader('content-type');
        const isJson = typeof contentType === 'string' && contentType.includes('application/json');
        if (isJson) {
          const raw = Buffer.concat(chunks).toString('utf-8');
          parsedResponseBody = tryParseJson(raw);
        }
      }

      if (activeSpan && captureResponse && parsedResponseBody !== undefined) {
        flattenToSpan(activeSpan, 'haoc.response.body', parsedResponseBody, 0, sensitiveFields);
      }

      const resAttrs: AttrRecord = {
        'http.method': method,
        'http.route': route,
        'http.status_code': statusCode,
        'http.duration_ms': duration,
        'haoc.otel.profile': runtime.profile,
      };

      if (logResponse && parsedResponseBody !== undefined) {
        flattenToRecord(resAttrs, 'haoc.response.body', parsedResponseBody, 0, sensitiveFields);
      }

      if (statusCode >= 400) {
        logger?.error(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
        otelEmit('error', {
          msg: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          req: { method, url: req.url },
          res: {
            statusCode,
            responseTime: duration,
            ...(logResponse && parsedResponseBody !== undefined
              ? { body: sanitizeNested(parsedResponseBody, sensitiveFields) as Record<string, unknown> }
              : {}),
          },
          service: process.env.OTEL_SERVICE_NAME,
          environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
          requestPath: req.url,
          'haoc.otel.profile': runtime.profile,
        });
      } else {
        logger?.info(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
        otelEmit('info', {
          msg: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          req: { method, url: req.url },
          res: {
            statusCode,
            responseTime: duration,
            ...(logResponse && parsedResponseBody !== undefined
              ? { body: sanitizeNested(parsedResponseBody, sensitiveFields) as Record<string, unknown> }
              : {}),
          },
          service: process.env.OTEL_SERVICE_NAME,
          environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
          requestPath: req.url,
          'haoc.otel.profile': runtime.profile,
        });
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
