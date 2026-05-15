import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';

import { flattenToSpan, flattenToRecord, type AttrRecord } from '../utils/flatten';
import { hasContent } from '../utils/stringify';
import { DEFAULT_SENSITIVE_FIELDS, mergeSensitiveFields, sanitizeNested } from '../utils/sanitize';
import { getUserSpanAttributes, getUserByTraceId, clearUserByTraceId } from '../identity';
import { getRuntimeProfile, matchesAny, shouldLogBodyForRoute } from '../tracing/profile';
import { otelEmit } from '../logger/otel-emit';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_USER_AGENT_ORIGINAL,
  ATTR_OTEL_PROFILE,
  ATTR_HTTP_IS_PREFLIGHT,
  ATTR_LOG_EVENT,
  ATTR_LOG_TITLE,
  ATTR_REQUEST_JSON,
  ATTR_RESPONSE_JSON,
  ATTR_ERROR_JSON,
  LOG_EVENT_REQUEST,
  LOG_EVENT_RESPONSE,
  LOG_EVENT_ERROR,
  LOG_EVENT_PREFLIGHT,
} from '../core/semantic-attributes';
import { sanitizeToJsonAttr } from '../core/sanitize-payload';
import { evaluatePreflight } from '../core/preflight-policy';

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
 *   provide: OTEL_SENSITIVE_FIELDS,
 *   useValue: mergeSensitiveFields(['cpf', 'rg']),
 * }
 * ```
 */
export const OTEL_SENSITIVE_FIELDS = 'OTEL_SENSITIVE_FIELDS';
/** @deprecated Use {@link OTEL_SENSITIVE_FIELDS} */
export const HAOC_SENSITIVE_FIELDS = OTEL_SENSITIVE_FIELDS;

/**
 * NestJS HTTP interceptor that correlates every request/response with the
 * active OpenTelemetry span and produces structured Pino logs.
 *
 * Register globally in your AppModule:
 * ```ts
 * { provide: APP_INTERCEPTOR, useClass: OtelInterceptor }
 * ```
 */
@Injectable()
export class OtelInterceptor implements NestInterceptor {
  private readonly sensitiveFields: Set<string>;

  constructor(
    @InjectPinoLogger('HTTP') private readonly logger: PinoLogger,
    @Optional()
    @Inject(OTEL_SENSITIVE_FIELDS)
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
      return next.handle();
    }

    // ── Preflight (OPTIONS) policy ────────────────────────────────────
    const preflight = evaluatePreflight(method, runtime.profile);
    if (preflight.isPreflight && activeSpan) {
      activeSpan.setAttribute(ATTR_HTTP_IS_PREFLIGHT, true);
    }

    const captureBody = runtime.captureRequestBody;
    const captureResponse = runtime.captureResponseBody;
    const logPayloadMode = runtime.logPayloadMode;

    const routeAllowsLogBody = shouldLogBodyForRoute(runtime, route);
    const logBody = runtime.logRequestBody && routeAllowsLogBody;
    const logResponse = runtime.logResponseBody && routeAllowsLogBody;

    const rawBody = hasContent(request.body) ? request.body : undefined;
    const rawQuery = hasContent(request.query) ? request.query : undefined;
    const rawParams = hasContent(request.params) ? request.params : undefined;

    // "Input payload" = the primary input data for this request:
    // GET/HEAD/DELETE → query params; POST/PUT/PATCH → request body
    const inputPayload = ['GET', 'HEAD', 'DELETE'].includes(method) ? rawQuery : rawBody;

    // ── User Identity (read once; used for span, request log, and response fallback)
    const userAttrs = getUserSpanAttributes();

    if (activeSpan) {
      activeSpan.setAttribute(ATTR_HTTP_ROUTE, route);
      activeSpan.setAttribute(ATTR_URL_PATH, request.path);
      if (request.headers?.['user-agent']) {
        activeSpan.setAttribute(ATTR_USER_AGENT_ORIGINAL, String(request.headers['user-agent']));
      }
      activeSpan.setAttribute(ATTR_OTEL_PROFILE, runtime.profile);
      activeSpan.setAttribute(
        'environment',
        process.env.OTEL_ENVIRONMENT || process.env.APP_ENV || 'local',
      );
      // NestJS controller/handler attrs (previously set by nestjs-core instrumentation)
      activeSpan.setAttribute('nestjs.controller', ctx.getClass().name);
      activeSpan.setAttribute('nestjs.callback', ctx.getHandler().name);
      if (rawQuery) flattenToSpan(activeSpan, 'request.query', rawQuery, 0, this.sensitiveFields);
      if (rawParams) flattenToSpan(activeSpan, 'request.params', rawParams, 0, this.sensitiveFields);
      if (captureBody && inputPayload) flattenToSpan(activeSpan, 'body', inputPayload, 0, this.sensitiveFields);

      // ── User Identity ─────────────────────────────────────────────
      for (const [key, value] of Object.entries(userAttrs)) {
        activeSpan.setAttribute(key, value);
      }

      // ── Infrastructure / Hop Tracking ─────────────────────────────
      const headers = request.headers;
      const forwardedFor = headers['x-forwarded-for'];
      if (forwardedFor) {
        const ffValue = Array.isArray(forwardedFor) ? forwardedFor.join(', ') : forwardedFor;
        activeSpan.setAttribute('http.forwarded_for', ffValue);
        activeSpan.setAttribute('network.hop_count', ffValue.split(',').length);
      }
      if (headers['x-real-ip']) activeSpan.setAttribute('http.real_ip', String(headers['x-real-ip']));
      if (headers['x-forwarded-host']) activeSpan.setAttribute('http.forwarded_host', String(headers['x-forwarded-host']));
      if (headers['x-forwarded-proto']) activeSpan.setAttribute('http.forwarded_proto', String(headers['x-forwarded-proto']));
      if (headers['via']) activeSpan.setAttribute('http.via', String(headers['via']));

      // ── Baggage from Frontend ──────────────────────────────────────
      const baggage = propagation.getBaggage(context.active());
      if (baggage) {
        const baggageEntries = baggage.getAllEntries();
        for (const [key, entry] of baggageEntries) {
          if (key.startsWith('user.') || key.startsWith('page.') ||
              key.startsWith('browser.') || key.startsWith('device.') ||
              key.startsWith('app.')) {
            activeSpan.setAttribute(key, entry.value);
          }
        }
      }
    }

    // ── Request log — skip entirely for OPTIONS if profile says so ────
    if (!preflight.isPreflight || preflight.shouldLog) {
      const reqAttrs: AttrRecord = {
        [ATTR_HTTP_REQUEST_METHOD]: method,
        [ATTR_HTTP_ROUTE]: route,
        [ATTR_OTEL_PROFILE]: runtime.profile,
        [ATTR_LOG_EVENT]: preflight.isPreflight ? LOG_EVENT_PREFLIGHT : LOG_EVENT_REQUEST,
        [ATTR_LOG_TITLE]: `${method} ${route} [${traceId}]`,
      };
      if (rawQuery) flattenToRecord(reqAttrs, 'request.query', rawQuery, 0, this.sensitiveFields);
      if (rawParams) flattenToRecord(reqAttrs, 'request.params', rawParams, 0, this.sensitiveFields);

      let requestJson: string | undefined;
      if (logBody && inputPayload) {
        if (logPayloadMode === 'json-attr') {
          requestJson = sanitizeToJsonAttr(inputPayload, { sensitiveFields: this.sensitiveFields, maxBytes: 16 * 1024 }) ?? undefined;
          if (requestJson) reqAttrs[ATTR_REQUEST_JSON] = requestJson;
        } else if (logPayloadMode === 'flatten') {
          flattenToRecord(reqAttrs, 'body', inputPayload, 0, this.sensitiveFields);
        }
      }
      // User attrs are known at request time when identifyUser() was called in a guard
      Object.assign(reqAttrs, userAttrs);

      this.logger.info(reqAttrs, `${method} ${route} [${traceId}]`);
      otelEmit('info',
        (logBody && inputPayload)
          ? sanitizeNested(inputPayload, this.sensitiveFields) as Record<string, unknown>
          : `${method} ${route} [${traceId}]`,
        {
          [ATTR_LOG_EVENT]: preflight.isPreflight ? LOG_EVENT_PREFLIGHT : LOG_EVENT_REQUEST,
          [ATTR_LOG_TITLE]: `${method} ${route} [${traceId}]`,
          [ATTR_OTEL_PROFILE]: runtime.profile,
          ...(requestJson ? { [ATTR_REQUEST_JSON]: requestJson } : {}),
          ...userAttrs,
        },
      );
    }

    return next.handle().pipe(
      tap((responseBody) => {
        // Skip response log for OPTIONS if profile says so
        if (preflight.isPreflight && !preflight.shouldLog) return;

        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        const isStreamResponse =
          responseBody?.constructor?.name === 'ServerResponse' ||
          responseBody?.constructor?.name === 'ServerResponseImpl';

        const resAttrs: AttrRecord = {
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_HTTP_ROUTE]: route,
          [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
          'http.duration_ms': duration,
          [ATTR_OTEL_PROFILE]: runtime.profile,
          [ATTR_LOG_EVENT]: LOG_EVENT_RESPONSE,
          [ATTR_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
        };

        if (activeSpan) {
          activeSpan.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
          activeSpan.setAttribute('http.duration_ms', duration);
          if (captureResponse && responseBody !== undefined && !isStreamResponse) {
            flattenToSpan(activeSpan, 'response.body', responseBody, 0, this.sensitiveFields);
          }
        }

        if (logResponse && responseBody !== undefined && !isStreamResponse && logPayloadMode === 'flatten') {
          flattenToRecord(resAttrs, 'response.body', responseBody, 0, this.sensitiveFields);
        }

        let responseJson: string | undefined;
        if (logResponse && responseBody !== undefined && !isStreamResponse && logPayloadMode === 'json-attr') {
          responseJson = sanitizeToJsonAttr(responseBody, { sensitiveFields: this.sensitiveFields, maxBytes: 16 * 1024 }) ?? undefined;
          if (responseJson) resAttrs[ATTR_RESPONSE_JSON] = responseJson;
        }

        // Prefer AsyncLocalStorage; fall back to per-trace map when
        // identifyUser() was called inside the handler (Forma 2) and the
        // RxJS Observable subscription runs in a different async context.
        let userAttrsOnRes = getUserSpanAttributes();
        if (!userAttrsOnRes['user.id'] && traceId !== 'none') {
          const u = getUserByTraceId(traceId);
          if (u) {
            userAttrsOnRes = {
              'user.id': u.id,
              'user.type': u.type ?? 'authenticated',
              ...(u.role ? { 'user.role': u.role } : {}),
            };
          }
        }

        if (activeSpan) {
          for (const [key, value] of Object.entries(userAttrsOnRes)) activeSpan.setAttribute(key, value);
        }
        // Include user attrs in Pino log too
        Object.assign(resAttrs, userAttrsOnRes);

        this.logger.info(resAttrs, `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`);
        otelEmit('info',
          (logResponse && responseBody !== undefined && !isStreamResponse)
            ? sanitizeNested(responseBody, this.sensitiveFields) as Record<string, unknown>
            : `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          {
            [ATTR_LOG_EVENT]: LOG_EVENT_RESPONSE,
            [ATTR_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
            [ATTR_OTEL_PROFILE]: runtime.profile,
            ...(responseJson ? { [ATTR_RESPONSE_JSON]: responseJson } : {}),
            ...userAttrsOnRes,
          },
        );
      }),
      catchError((err: Error & { status?: number; stack?: string; getResponse?: () => unknown }) => {
        const duration = Date.now() - startTime;
        const statusCode = err.status || 500;

        const errorResponse = typeof err.getResponse === 'function' ? err.getResponse() : undefined;

        if (activeSpan) {
          activeSpan.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
          activeSpan.setAttribute('http.duration_ms', duration);
          activeSpan.setAttribute('error.message', String(err.message));
          activeSpan.setAttribute('error.type', err.constructor?.name || 'Error');
          if (errorResponse && typeof errorResponse === 'object') {
            flattenToSpan(activeSpan, 'error.response', errorResponse, 0, this.sensitiveFields);
          }
          activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          activeSpan.recordException(err);
        }

        const errAttrs: AttrRecord = {
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_HTTP_ROUTE]: route,
          [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
          'http.duration_ms': duration,
          [ATTR_OTEL_PROFILE]: runtime.profile,
          [ATTR_LOG_EVENT]: LOG_EVENT_ERROR,
          [ATTR_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
          'error.message': String(err.message),
          'error.type': err.constructor?.name || 'Error',
        };

        const errorJson = (errorResponse && typeof errorResponse === 'object')
          ? sanitizeToJsonAttr(errorResponse, { sensitiveFields: this.sensitiveFields })
          : undefined;
        if (errorJson) errAttrs[ATTR_ERROR_JSON] = errorJson;

        if (logResponse && errorResponse && typeof errorResponse === 'object' && logPayloadMode === 'flatten') {
          flattenToRecord(errAttrs, 'error.response', errorResponse, 0, this.sensitiveFields);
        }

        const userAttrsOnErr = getUserSpanAttributes();
        if (activeSpan) {
          for (const [key, value] of Object.entries(userAttrsOnErr)) activeSpan.setAttribute(key, value);
        }
        Object.assign(errAttrs, userAttrsOnErr);

        this.logger.error(errAttrs, `${method} ${route} ${statusCode} ${duration}ms [${traceId}] ${err.message}`);
        otelEmit('error',
          `${method} ${route} ${statusCode} ${duration}ms [${traceId}] ${err.message}`,
          {
            [ATTR_LOG_EVENT]: LOG_EVENT_ERROR,
            [ATTR_LOG_TITLE]: `${method} ${route} ${statusCode} ${duration}ms [${traceId}]`,
            [ATTR_OTEL_PROFILE]: runtime.profile,
            ...userAttrsOnErr,
            ...(errorJson ? { [ATTR_ERROR_JSON]: errorJson } : {}),
          },
        );

        return throwError(() => err);
      }),
      finalize(() => {
        if (traceId !== 'none') clearUserByTraceId(traceId);
      }),
    );
  }
}

/** @deprecated Use {@link OtelInterceptor} instead. */
export const HaocTraceInterceptor = OtelInterceptor;
