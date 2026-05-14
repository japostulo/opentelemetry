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
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_USER_AGENT_ORIGINAL,
  ATTR_HAOC_PROFILE,
  ATTR_HAOC_IS_PREFLIGHT,
  ATTR_HAOC_LOG_EVENT,
  ATTR_HAOC_LOG_TITLE,
  ATTR_HAOC_REQUEST_JSON,
  LOG_EVENT_REQUEST,
  LOG_EVENT_RESPONSE,
  LOG_EVENT_ERROR,
  LOG_EVENT_PREFLIGHT,
} from '../core/semantic-attributes';
import { sanitizeToJsonAttr } from '../core/sanitize-payload';
import { evaluatePreflight } from '../core/preflight-policy';

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

    // ── Preflight (OPTIONS) policy ────────────────────────────────────
    const preflight = evaluatePreflight(method, runtime.profile);
    if (preflight.isPreflight && activeSpan) {
      activeSpan.setAttribute(ATTR_HAOC_IS_PREFLIGHT, true);
    }

    const captureBody = runtime.captureRequestBody;
    const captureResponse = runtime.captureResponseBody;
    const logPayloadMode = runtime.logPayloadMode;

    // Log body controls
    const routeAllowsLogBody = shouldLogBodyForRoute(runtime, route);
    const logBody = runtime.logRequestBody && routeAllowsLogBody;
    const logResponse = runtime.logResponseBody && routeAllowsLogBody;

    const rawBody = hasContent(req.body) ? req.body : undefined;
    const rawQuery = hasContent(req.query) ? req.query : undefined;
    const rawParams = hasContent(req.params) ? req.params : undefined;

    // "Input payload" = the primary input data for this request:
    // GET/HEAD/DELETE → query params; POST/PUT/PATCH → request body
    const inputPayload = ['GET', 'HEAD', 'DELETE'].includes(method) ? rawQuery : rawBody;

    // ── User Identity (read once; used for span, request log, and response fallback)
    const userAttrs = getUserSpanAttributes();

    // ── Span attributes (new semconv + legacy aliases) ────────────────
    if (activeSpan) {
      activeSpan.setAttribute(ATTR_HTTP_ROUTE, route);
      activeSpan.setAttribute(ATTR_URL_PATH, req.path);
      if (req.headers['user-agent']) {
        activeSpan.setAttribute(ATTR_USER_AGENT_ORIGINAL, String(req.headers['user-agent']));
      }
      activeSpan.setAttribute(ATTR_HAOC_PROFILE, runtime.profile);
      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      if (rawQuery) flattenToSpan(activeSpan, 'request.query', rawQuery, 0, sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'request.params', rawParams, 0, sensitiveFields);
      if (captureBody && inputPayload) flattenToSpan(activeSpan, 'body', inputPayload, 0, sensitiveFields);

      // ── User Identity ─────────────────────────────────────────────
      for (const [key, value] of Object.entries(userAttrs)) {
        activeSpan.setAttribute(key, value);
      }

      // ── Infrastructure / Hop Tracking ─────────────────────────────
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

      // ── Baggage from Frontend ──────────────────────────────────────
      const baggage = propagation.getBaggage(context.active());
      if (baggage) {
        for (const [key, entry] of baggage.getAllEntries()) {
          if (key.startsWith('user.') || key.startsWith('page.') ||
              key.startsWith('browser.') || key.startsWith('device.') ||
              key.startsWith('app.')) {
            activeSpan.setAttribute(key, entry.value);
          }
        }
      }
    }

    // ── Request log ───────────────────────────────────────────────────
    // Skip log entirely for OPTIONS if profile says so
    if (!preflight.isPreflight || preflight.shouldLog) {
      const reqAttrs: AttrRecord = {
        [ATTR_HTTP_REQUEST_METHOD]: method,
        [ATTR_HTTP_ROUTE]: route,
        [ATTR_HAOC_PROFILE]: runtime.profile,
        [ATTR_HAOC_LOG_EVENT]: preflight.isPreflight ? LOG_EVENT_PREFLIGHT : LOG_EVENT_REQUEST,
        [ATTR_HAOC_LOG_TITLE]: `${method} ${route} [${traceId}]`,
      };
      if (rawQuery) flattenToRecord(reqAttrs, 'request.query', rawQuery, 0, sensitiveFields);
      if (rawParams) flattenToRecord(reqAttrs, 'request.params', rawParams, 0, sensitiveFields);

      if (logBody && inputPayload) {
        if (logPayloadMode === 'json-attr') {
          const json = sanitizeToJsonAttr(inputPayload, { sensitiveFields, maxBytes: 16 * 1024 });
          if (json) reqAttrs[ATTR_HAOC_REQUEST_JSON] = json;
        } else if (logPayloadMode === 'flatten') {
          flattenToRecord(reqAttrs, 'body', inputPayload, 0, sensitiveFields);
        }
      }
      // User attrs are known at request time when identifyUser() was called in a middleware
      Object.assign(reqAttrs, userAttrs);

      const logger = (req as unknown as { log?: { info: Function; error: Function } }).log;
      logger?.info(reqAttrs, `${method} ${route} [${traceId}]`);
      otelEmit('info',
        (logBody && inputPayload)
          ? sanitizeNested(inputPayload, sensitiveFields) as Record<string, unknown>
          : `${method} ${route} [${traceId}]`,
        {
          [ATTR_HAOC_LOG_EVENT]: preflight.isPreflight ? LOG_EVENT_PREFLIGHT : LOG_EVENT_REQUEST,
          [ATTR_HAOC_LOG_TITLE]: `${method} ${route} [${traceId}]`,
          [ATTR_HAOC_PROFILE]: runtime.profile,
          ...userAttrs,
        },
      );
    }

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
        activeSpan.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
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
        flattenToSpan(activeSpan, 'response.body', parsedResponseBody, 0, sensitiveFields);
      }

      // Skip response log for OPTIONS if profile says so
      if (!preflight.isPreflight || preflight.shouldLog) {
        const resAttrs: AttrRecord = {
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_HTTP_ROUTE]: route,
          [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
          'http.duration_ms': duration,
          [ATTR_HAOC_PROFILE]: runtime.profile,
          [ATTR_HAOC_LOG_EVENT]: statusCode >= 400 ? LOG_EVENT_ERROR : LOG_EVENT_RESPONSE,
          [ATTR_HAOC_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        };

        if (logResponse && parsedResponseBody !== undefined && logPayloadMode === 'flatten') {
          flattenToRecord(resAttrs, 'response.body', parsedResponseBody, 0, sensitiveFields);
        }

        const logLevel = statusCode >= 400 ? 'error' : 'info';
        const logger = (req as unknown as { log?: { info: Function; error: Function } }).log;
        if (statusCode >= 400) {
          logger?.error(resAttrs, `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`);
        } else {
          logger?.info(resAttrs, `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`);
        }

        const userAttrsOnClose = getUserSpanAttributes();
        if (activeSpan) {
          for (const [key, value] of Object.entries(userAttrsOnClose)) activeSpan.setAttribute(key, value);
        }

        otelEmit(logLevel as 'info' | 'error',
          (logResponse && parsedResponseBody !== undefined)
            ? sanitizeNested(parsedResponseBody, sensitiveFields) as Record<string, unknown>
            : `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          {
            [ATTR_HAOC_LOG_EVENT]: statusCode >= 400 ? LOG_EVENT_ERROR : LOG_EVENT_RESPONSE,
            [ATTR_HAOC_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
            [ATTR_HAOC_PROFILE]: runtime.profile,
            ...userAttrsOnClose,
          },
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
