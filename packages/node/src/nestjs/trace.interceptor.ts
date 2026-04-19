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
import { DEFAULT_SENSITIVE_FIELDS, mergeSensitiveFields } from '../utils/sanitize';
import { getUserSpanAttributes } from '../identity';
import { getRuntimeProfile, matchesAny } from '../tracing/profile';

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

    const rawBody =
      captureBody && hasContent(request.body) ? request.body : undefined;
    const rawQuery = hasContent(request.query) ? request.query : undefined;
    const rawParams = hasContent(request.params) ? request.params : undefined;

    if (activeSpan) {
      activeSpan.setAttribute('http.route', route);
      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      if (rawQuery) flattenToSpan(activeSpan, 'query', rawQuery, 0, this.sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'params', rawParams, 0, this.sensitiveFields);
      if (rawBody) flattenToSpan(activeSpan, 'body', rawBody, 0, this.sensitiveFields);

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
    };
    if (rawQuery) flattenToRecord(reqAttrs, 'query', rawQuery, 0, this.sensitiveFields);
    if (rawParams) flattenToRecord(reqAttrs, 'params', rawParams, 0, this.sensitiveFields);
    if (rawBody) flattenToRecord(reqAttrs, 'body', rawBody, 0, this.sensitiveFields);

    this.logger.info(reqAttrs, `${method} ${route} [${traceId}]`);

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
        };

        if (activeSpan) {
          activeSpan.setAttribute('http.status_code', statusCode);
          activeSpan.setAttribute('http.duration_ms', duration);
          if (
            captureResponse &&
            responseBody !== undefined &&
            !isStreamResponse
          ) {
            flattenToSpan(activeSpan, 'response', responseBody, 0, this.sensitiveFields);
            flattenToRecord(resAttrs, 'response', responseBody, 0, this.sensitiveFields);
          }
        }

        this.logger.info(
          resAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        );
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
            flattenToSpan(activeSpan, 'error.response', errorResponse, 0, this.sensitiveFields);
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
          'error.message': String(err.message),
          'error.type': err.constructor?.name || 'Error',
        };
        if (errorResponse && typeof errorResponse === 'object') {
          flattenToRecord(errAttrs, 'error.response', errorResponse, 0, this.sensitiveFields);
        }

        this.logger.error(
          errAttrs,
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}] ${err.message}`,
        );

        return throwError(() => err);
      }),
    );
  }
}
