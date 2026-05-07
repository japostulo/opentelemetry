import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';

import { flattenToSpan, flattenToRecord, type AttrRecord } from '../utils/flatten';
import { hasContent } from '../utils/stringify';
import { DEFAULT_SENSITIVE_FIELDS, mergeSensitiveFields, sanitizeNested } from '../utils/sanitize';
import { getUserSpanAttributes } from '../identity';
import { getRuntimeProfile, matchesAny, shouldLogBodyForRoute } from '../tracing/profile';
import { otelEmit } from '../logger/otel-emit';

export interface TraceInterceptorOptions {
  /**
   * Extra field names to treat as sensitive (merged with defaults).
   */
  extraSensitiveFields?: Iterable<string>;
}

/**
 * Injection token for custom sensitive fields.
 * Provide this in your module to extend the default set.
 *
 * @example
 * ```ts
 * {
 *   provide: HAOC_SENSITIVE_FIELDS,
 *   useValue: mergeSensitiveFields(['cpf', 'rg']),
 * }
 * ```
 */
export const HAOC_SENSITIVE_FIELDS = 'HAOC_SENSITIVE_FIELDS';

/**
 * NestJS HTTP interceptor that correlates every request/response with the
 * active OpenTelemetry span and produces structured Pino logs.
 *
 * Register globally in your AppModule:
 * ```ts
 * { provide: APP_INTERCEPTOR, useClass: HaocTraceInterceptor }
 * ```
 */
@Injectable()
export class HaocTraceInterceptor implements NestInterceptor {
  private readonly sensitiveFields: Set<string>;

  constructor(
    @InjectPinoLogger('HTTP') private readonly logger: PinoLogger,
    @Optional()
    @Inject(HAOC_SENSITIVE_FIELDS)
    customSensitiveFields?: Set<string>,
  ) {
    this.sensitiveFields = customSensitiveFields ?? DEFAULT_SENSITIVE_FIELDS;
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = ctx.switchToHttp();
    const request = httpCtx.getRequest();
    const response = httpCtx.getResponse();
    const startTime = Date.now();

    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    if (spanContext) {
      response.setHeader('X-Trace-Id', spanContext.traceId);
    }

    const route: string = request.route?.path || request.path;
    const method: string = request.method;
    const traceId = spanContext?.traceId || 'none';

    // ── Profile-driven runtime decisions ─────────────────────────────
    const runtime = getRuntimeProfile();
    if (matchesAny(runtime.ignoreRoutes, route)) {
      // Route is on the ignore list — pass through without enriching the
      // span or emitting request/response logs. The HTTP auto-instrumentation
      // ignoreIncomingRequestHook normally drops the span itself; this is a
      // belt-and-braces guard for routes registered after the SDK started.
      return next.handle();
    }

    const captureBody = runtime.captureRequestBody;
    const captureResponse = runtime.captureResponseBody;

    // Log body controls (independent of span attributes)
    const routeAllowsLogBody = shouldLogBodyForRoute(runtime, route);
    const logBody = runtime.logRequestBody && routeAllowsLogBody;
    const logResponse = runtime.logResponseBody && routeAllowsLogBody;

    const rawBody = hasContent(request.body) ? request.body : undefined;
    const rawQuery = hasContent(request.query) ? request.query : undefined;
    const rawParams = hasContent(request.params) ? request.params : undefined;

    if (activeSpan) {
      activeSpan.setAttribute('http.route', route);
      activeSpan.setAttribute('haoc.otel.profile', runtime.profile);
      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      if (rawQuery) flattenToSpan(activeSpan, 'haoc.request.query', rawQuery, 0, this.sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'haoc.request.params', rawParams, 0, this.sensitiveFields);
      if (captureBody && rawBody) flattenToSpan(activeSpan, 'haoc.request.body', rawBody, 0, this.sensitiveFields);

      // ── User Identity ───────────────────────────────────────────────
      const userAttrs = getUserSpanAttributes();
      for (const [key, value] of Object.entries(userAttrs)) {
        activeSpan.setAttribute(key, value);
      }

      // ── Infrastructure / Hop Tracking ───────────────────────────────
      const headers = request.headers;
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
      // W3C Baggage propagated from frontend (page, browser, device info)
      const baggage = propagation.getBaggage(context.active());
      if (baggage) {
        const baggageEntries = baggage.getAllEntries();
        for (const [key, entry] of baggageEntries) {
          if (key.startsWith('haoc.') || key.startsWith('page.') ||
              key.startsWith('browser.') || key.startsWith('device.') ||
              key.startsWith('app.')) {
            activeSpan.setAttribute(key, entry.value);
          }
        }
      }
    }

    const reqAttrs: AttrRecord = {
      'http.method': method,
      'http.route': route,
      'haoc.otel.profile': runtime.profile,
    };
    if (rawQuery) flattenToRecord(reqAttrs, 'haoc.request.query', rawQuery, 0, this.sensitiveFields);
    if (rawParams) flattenToRecord(reqAttrs, 'haoc.request.params', rawParams, 0, this.sensitiveFields);
    if (logBody && rawBody) flattenToRecord(reqAttrs, 'haoc.request.body', rawBody, 0, this.sensitiveFields);

    this.logger.info(reqAttrs, `${method} ${route} [${traceId}]`);
    otelEmit('info', {
      msg: `${method} ${route} [${traceId}]`,
      req: {
        method,
        url: request.url,
        headers: {
          host: request.headers['host'],
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        },
        ...(rawQuery ? { query: sanitizeNested(rawQuery, this.sensitiveFields) as Record<string, unknown> } : {}),
        ...(logBody && rawBody ? { body: sanitizeNested(rawBody, this.sensitiveFields) as Record<string, unknown> } : {}),
      },
      service: process.env.OTEL_SERVICE_NAME,
      environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      requestPath: request.url,
      'haoc.otel.profile': runtime.profile,
    });

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        const isStreamResponse =
          responseBody?.constructor?.name === 'ServerResponse' ||
          responseBody?.constructor?.name === 'ServerResponseImpl';

        const resAttrs: AttrRecord = {
          'http.method': method,
          'http.route': route,
          'http.status_code': statusCode,
          'http.duration_ms': duration,
          'haoc.otel.profile': runtime.profile,
        };

        if (activeSpan) {
          activeSpan.setAttribute('http.status_code', statusCode);
          activeSpan.setAttribute('http.duration_ms', duration);
          if (
            captureResponse &&
            responseBody !== undefined &&
            !isStreamResponse
          ) {
            flattenToSpan(activeSpan, 'haoc.response.body', responseBody, 0, this.sensitiveFields);
          }
        }

        if (
          logResponse &&
          responseBody !== undefined &&
          !isStreamResponse
        ) {
          flattenToRecord(resAttrs, 'haoc.response.body', responseBody, 0, this.sensitiveFields);
        }

        this.logger.info(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
        otelEmit('info', {
          msg: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          req: { method, url: request.url },
          res: {
            statusCode,
            responseTime: duration,
            ...(logResponse && responseBody !== undefined && !isStreamResponse
              ? { body: sanitizeNested(responseBody, this.sensitiveFields) as Record<string, unknown> }
              : {}),
          },
          service: process.env.OTEL_SERVICE_NAME,
          environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
          requestPath: request.url,
          'haoc.otel.profile': runtime.profile,
        });
      }),
      catchError((err: Error & { status?: number; stack?: string; getResponse?: () => unknown }) => {
        const duration = Date.now() - startTime;
        const statusCode = err.status || 500;

        // Try to capture the error response body (e.g. HttpException response)
        const errorResponse = typeof err.getResponse === 'function' ? err.getResponse() : undefined;

        if (activeSpan) {
          activeSpan.setAttribute('http.status_code', statusCode);
          activeSpan.setAttribute('http.duration_ms', duration);
          activeSpan.setAttribute('error.message', String(err.message));
          activeSpan.setAttribute(
            'error.type',
            err.constructor?.name || 'Error',
          );
          if (errorResponse && typeof errorResponse === 'object') {
            flattenToSpan(activeSpan, 'haoc.error.response', errorResponse, 0, this.sensitiveFields);
          }
          activeSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          activeSpan.recordException(err);
        }

        const errAttrs: AttrRecord = {
          'http.method': method,
          'http.route': route,
          'http.status_code': statusCode,
          'http.duration_ms': duration,
          'haoc.otel.profile': runtime.profile,
          'error.message': String(err.message),
          'error.type': err.constructor?.name || 'Error',
        };
        if (logResponse && errorResponse && typeof errorResponse === 'object') {
          flattenToRecord(errAttrs, 'haoc.error.response', errorResponse, 0, this.sensitiveFields);
        }

        this.logger.error(
          errAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}] ${err.message}`,
        );
        otelEmit('error', {
          msg: `${method} ${route} ${statusCode} ${duration}ms [${traceId}] ${err.message}`,
          req: { method, url: request.url },
          error: {
            message: String(err.message),
            type: err.constructor?.name || 'Error',
            ...(errorResponse && typeof errorResponse === 'object'
              ? { response: sanitizeNested(errorResponse, this.sensitiveFields) as Record<string, unknown> }
              : {}),
          },
          res: { statusCode },
          service: process.env.OTEL_SERVICE_NAME,
          environment: process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
          requestPath: request.url,
          'haoc.otel.profile': runtime.profile,
        });

        return throwError(() => err);
      }),
    );
  }
}
