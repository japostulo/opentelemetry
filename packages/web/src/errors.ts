import { trace, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'haoc-error-handler';

/**
 * Installs global error handlers that create error spans:
 * - window.onerror — catches unhandled JS errors
 * - window.onunhandledrejection — catches unhandled promise rejections
 *
 * Call this after initTracing().
 */
export function installErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  const tracer = trace.getTracer(TRACER_NAME);

  // ── Unhandled JS Errors ─────────────────────────────────────────────
  const prevOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    tracer.startActiveSpan('unhandled-error', (span) => {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(message) });
      span.setAttribute('error.message', String(message));
      span.setAttribute('error.type', error?.name ?? 'Error');
      if (source) span.setAttribute('error.source', source);
      if (lineno) span.setAttribute('error.lineno', lineno);
      if (colno) span.setAttribute('error.colno', colno);
      if (error) span.recordException(error);
      span.end();
    });

    if (prevOnError) {
      return prevOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  // ── Unhandled Promise Rejections ────────────────────────────────────
  window.addEventListener('unhandledrejection', (event) => {
    tracer.startActiveSpan('unhandled-rejection', (span) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.setAttribute('error.message', message);
      span.setAttribute('error.type', reason?.constructor?.name ?? 'UnhandledRejection');
      if (reason instanceof Error) {
        span.recordException(reason);
      }
      span.end();
    });
  });
}

/**
 * Creates a Vue error handler that records error spans.
 * Use with `app.config.errorHandler`:
 *
 * @example
 * ```ts
 * import { createVueErrorHandler } from '@haocruz/opentelemetry-web';
 * app.config.errorHandler = createVueErrorHandler();
 * ```
 */
export function createVueErrorHandler() {
  const tracer = trace.getTracer(TRACER_NAME);

  return (err: unknown, instance: unknown, info: string) => {
    tracer.startActiveSpan('vue-error', (span) => {
      const error = err instanceof Error ? err : new Error(String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.setAttribute('error.message', error.message);
      span.setAttribute('error.type', error.name);
      span.setAttribute('vue.error_info', info);
      span.recordException(error);
      span.end();
    });

    // Re-throw for development (Vue will log it)
    console.error(err);
  };
}
