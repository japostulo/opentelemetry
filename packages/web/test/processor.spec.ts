// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ROOT_CONTEXT, type Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HaocSpanProcessor } from '../src/processor';
import type { BrowserInfo } from '../src/browser';

function makeInner(): SpanProcessor & {
  onStart: ReturnType<typeof vi.fn>;
  onEnd: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
  forceFlush: ReturnType<typeof vi.fn>;
} {
  return {
    onStart: vi.fn(),
    onEnd: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    forceFlush: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof makeInner>;
}

function makeSpan(
  attrs: Record<string, unknown>,
  name = 'span',
): Span & ReadableSpan {
  const span = {
    name,
    attributes: { ...attrs },
    setAttribute: vi.fn(function (this: { attributes: Record<string, unknown> }, k: string, v: unknown) {
      this.attributes[k] = v;
      return this as unknown as Span;
    }),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    spanContext: vi.fn().mockReturnValue({ traceId: 't', spanId: 's' }),
  } as unknown as Span & ReadableSpan;
  return span;
}

const browserInfo: BrowserInfo = {
  'browser.name': 'chrome',
  'browser.version': '120',
  'device.type': 'desktop',
  'os.name': 'linux',
  'os.version': '5.0',
  'app.platform': 'web-browser',
};

const fakeCtx: Context = ROOT_CONTEXT;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HaocSpanProcessor.shouldDrop (via onEnd)', () => {
  it('drops a span when otel.drop=true', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {
      ignoreUrls: [],
    });
    const span = makeSpan({ 'otel.drop': true });
    proc.onEnd(span);
    expect(inner.onEnd).not.toHaveBeenCalled();
  });

  it('forwards a span when otel.drop is missing/false', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {});
    proc.onEnd(makeSpan({}));
    expect(inner.onEnd).toHaveBeenCalledTimes(1);
  });

  it('drops by http.url match', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {
      ignoreUrls: [/foo\.png/i],
    });
    proc.onEnd(makeSpan({ 'http.url': 'https://cdn/foo.png' }));
    expect(inner.onEnd).not.toHaveBeenCalled();
  });

  it('drops by http.target match', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {
      ignoreUrls: [/^\/static/],
    });
    proc.onEnd(makeSpan({ 'http.target': '/static/x.css' }));
    expect(inner.onEnd).not.toHaveBeenCalled();
  });

  it('drops by span name match as last resort', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {
      ignoreUrls: [/^GET \/health/],
    });
    proc.onEnd(makeSpan({}, 'GET /health'));
    expect(inner.onEnd).not.toHaveBeenCalled();
  });

  it('does not drop when patterns are empty even if attrs are missing', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, { ignoreUrls: [] });
    proc.onEnd(makeSpan({}));
    expect(inner.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('HaocSpanProcessor.onStart', () => {
  it('skips enrichment + inner.onStart when span should be dropped', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {});
    const span = makeSpan({ 'otel.drop': true });
    proc.onStart(span, fakeCtx);
    expect(inner.onStart).not.toHaveBeenCalled();
    // setAttribute must not have been called for enrichment fields.
    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('enriches a normal span and calls inner.onStart', () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {});
    const span = makeSpan({});
    proc.onStart(span, fakeCtx);
    expect(inner.onStart).toHaveBeenCalledWith(span, fakeCtx);
    // Enrichment must include browser info.
    expect(span.setAttribute).toHaveBeenCalledWith('browser.name', 'chrome');
    expect(span.setAttribute).toHaveBeenCalledWith('app.platform', 'web-browser');
  });
});

describe('HaocSpanProcessor lifecycle pass-through', () => {
  it('shutdown delegates to inner', async () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {});
    await proc.shutdown();
    expect(inner.shutdown).toHaveBeenCalledTimes(1);
  });
  it('forceFlush delegates to inner', async () => {
    const inner = makeInner();
    const proc = new HaocSpanProcessor(inner, browserInfo, {});
    await proc.forceFlush();
    expect(inner.forceFlush).toHaveBeenCalledTimes(1);
  });
});
