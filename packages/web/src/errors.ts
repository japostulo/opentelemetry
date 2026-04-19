import { trace, SpanStatusCode } from '@opentelemetry/api';
import { matchesAny } from './profile';

const TRACER_NAME = 'haoc-error-handler';

export interface ErrorHandlerOptions {
  /**
   * Error messages (regex) to silently ignore — matching errors do not
   * produce a span. Useful for noisy non-actionable browser errors like
   * `ResizeObserver loop limit exceeded` or cross-origin `Script error.`.
   */
  ignoreErrorMessages?: RegExp[];
}

/**
 * Installs global error handlers that create error spans:
 * - window.onerror — catches unhandled JS errors
 * - window.onunhandledrejection — catches unhandled promise rejections
 *
 * Errors whose message matches `ignoreErrorMessages` are dropped silently
 * (the previous handler chain is still invoked).
 */
export function installErrorHandlers(options: ErrorHandlerOptions = {}): void {
  if (typeof window === 'undefined') return;

  const ignore = options.ignoreErrorMessages ?? [];
  const tracer = trace.getTracer(TRACER_NAME);

  // ── Unhandled JS Errors ─────────────────────────────────────────────
  const prevOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = String(message);
    if (!matchesAny(ignore, msg)) {
      tracer.startActiveSpan('unhandled-error', (span) => {
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        span.setAttribute('error.message', msg);
        span.setAttribute('error.type', error?.name ?? 'Error');
        if (source) span.setAttribute('error.source', source);
        if (lineno) span.setAttribute('error.lineno', lineno);
        if (colno) span.setAttribute('error.colno', colno);
        if (error) span.recordException(error);
        span.end();
      });
    }

    if (prevOnError) {
      return prevOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  // ── Unhandled Promise Rejections ────────────────────────────────────
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    if (matchesAny(ignore, message)) return;

    tracer.startActiveSpan('unhandled-rejection', (span) => {
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.setAttribute('error.message', message);
      span.setAttribute(
        'error.type',
        reason?.constructor?.name ?? 'UnhandledRejection',
      );
      if (reason instanceof Error) {
        span.recordException(reason);
      }
      span.end();
    });
  });
}

/**
 * Creates a Vue error handler that records error spans, honouring an
 * optional `ignoreErrorMessages` list.
 */
export function createVueErrorHandler(options: ErrorHandlerOptions = {}) {
  const tracer = trace.getTracer(TRACER_NAME);
  const ignore = options.ignoreErrorMessages ?? [];

  return (err: unknown, _instance: unknown, info: string) => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (!matchesAny(ignore, error.message)) {
      tracer.startActiveSpan('vue-error', (span) => {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.setAttribute('error.message', error.message);
        span.setAttribute('error.type', error.name);
        span.setAttribute('vue.error_info', info);
        span.recordException(error);
        span.end();
      });
    }

    // Re-throw for development (Vue will log it)
    console.error(err);
  };
}
