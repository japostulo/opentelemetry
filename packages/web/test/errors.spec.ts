// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trace } from '@opentelemetry/api';
import { createVueErrorHandler, installErrorHandlers } from '../src/errors';

const TRACER_NAME = 'haoc-error-handler';

let startActiveSpan: ReturnType<typeof vi.fn>;
let span: {
  setStatus: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  span = {
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  startActiveSpan = vi.fn((_name: string, fn: (s: typeof span) => unknown) =>
    fn(span),
  );
  vi.spyOn(trace, 'getTracer').mockReturnValue({
    startActiveSpan,
  } as unknown as ReturnType<typeof trace.getTracer>);
  // Reset window.onerror between tests
  if (typeof window !== 'undefined') {
    window.onerror = null;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installErrorHandlers — window.onerror filtering', () => {
  it('creates a span for an unfiltered error message', () => {
    installErrorHandlers({ ignoreErrorMessages: [] });
    const handled = window.onerror?.(
      'Boom!',
      'app.js',
      10,
      5,
      new Error('Boom!'),
    );
    expect(startActiveSpan).toHaveBeenCalledWith('unhandled-error', expect.any(Function));
    expect(span.setAttribute).toHaveBeenCalledWith('error.message', 'Boom!');
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(handled).toBe(false);
  });

  it('drops an error whose message matches ignore list', () => {
    installErrorHandlers({
      ignoreErrorMessages: [/ResizeObserver loop limit exceeded/i],
    });
    window.onerror?.('ResizeObserver loop limit exceeded', '', 0, 0, undefined);
    expect(startActiveSpan).not.toHaveBeenCalled();
  });

  it('chains the previous window.onerror', () => {
    const prev = vi.fn().mockReturnValue(true);
    window.onerror = prev as unknown as OnErrorEventHandler;
    installErrorHandlers({ ignoreErrorMessages: [] });
    const result = window.onerror?.('msg', 'src', 1, 2, undefined);
    expect(prev).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('installErrorHandlers — unhandledrejection filtering', () => {
  it('creates a span for an unfiltered rejection', () => {
    installErrorHandlers({ ignoreErrorMessages: [] });
    const ev = new Event('unhandledrejection') as Event & { reason: unknown };
    Object.defineProperty(ev, 'reason', { value: new Error('reject!') });
    window.dispatchEvent(ev);
    expect(startActiveSpan).toHaveBeenCalledWith('unhandled-rejection', expect.any(Function));
    expect(span.setAttribute).toHaveBeenCalledWith('error.message', 'reject!');
  });

  it('drops a rejection matched by ignore list', () => {
    installErrorHandlers({ ignoreErrorMessages: [/^Non-Error/] });
    const ev = new Event('unhandledrejection') as Event & { reason: unknown };
    Object.defineProperty(ev, 'reason', {
      value: 'Non-Error promise rejection captured',
    });
    window.dispatchEvent(ev);
    expect(startActiveSpan).not.toHaveBeenCalled();
  });
});

describe('createVueErrorHandler', () => {
  it('returns a handler that creates a span for unfiltered errors', () => {
    const handler = createVueErrorHandler({ ignoreErrorMessages: [] });
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    handler(new Error('vue boom'), null, 'render');
    expect(startActiveSpan).toHaveBeenCalledWith('vue-error', expect.any(Function));
    expect(span.setAttribute).toHaveBeenCalledWith('error.message', 'vue boom');
    expect(span.setAttribute).toHaveBeenCalledWith('vue.error_info', 'render');
    expect(consoleErr).toHaveBeenCalled();
  });

  it('drops an error matched by ignore list', () => {
    const handler = createVueErrorHandler({ ignoreErrorMessages: [/silent/i] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    handler(new Error('silent kaboom'), null, 'render');
    expect(startActiveSpan).not.toHaveBeenCalled();
  });

  it('wraps non-Error values into Error', () => {
    const handler = createVueErrorHandler();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    handler('plain string', null, 'setup');
    expect(startActiveSpan).toHaveBeenCalled();
    expect(span.setAttribute).toHaveBeenCalledWith('error.message', 'plain string');
  });
});

// Sanity: keep TRACER_NAME export covered by importing it indirectly.
describe('tracer name', () => {
  it('uses the haoc-error-handler tracer', () => {
    installErrorHandlers();
    expect(trace.getTracer).toHaveBeenCalledWith(TRACER_NAME);
  });
});
