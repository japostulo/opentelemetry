// @vitest-environment node
/**
 * Unit tests for distributed trace propagation in the Node package.
 *
 * Uses propagators directly (W3CTraceContextPropagator / W3CBaggagePropagator)
 * without relying on global API registration, which is not needed for unit
 * tests that only verify header encoding/decoding logic.
 *
 * Covers:
 * 1. W3C TraceContext inject/extract preserves trace_id
 * 2. inject → extract round-trip keeps trace_id intact
 * 3. Baggage inject/extract with W3CBaggagePropagator
 * 4. ATTR_TEST_RUN_ID constant value and usage as span attribute
 * 5. Multi-hop chain: all hops share the same trace_id
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  trace,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
} from '@opentelemetry/api';
import {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
} from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_TEST_RUN_ID } from '../src/core/semantic-attributes';

// ── Propagator instances (used directly, no global registration) ──────────

const tracePropagator = new W3CTraceContextPropagator();
const baggagePropagator = new W3CBaggagePropagator();

// ── Test tracer setup ─────────────────────────────────────────────────────

let provider: BasicTracerProvider;
let exporter: InMemorySpanExporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
});

afterEach(async () => {
  await provider.forceFlush();
  exporter.reset();
});

// ── helpers ───────────────────────────────────────────────────────────────

const getter = {
  get: (carrier: Record<string, string>, key: string) => carrier[key],
  keys: (carrier: Record<string, string>) => Object.keys(carrier),
};

const setter = {
  set: (carrier: Record<string, string>, key: string, value: string) => {
    carrier[key] = value;
  },
};

// ── W3C TraceContext — inject ─────────────────────────────────────────────

describe('W3CTraceContextPropagator — inject', () => {
  it('produces a valid traceparent header', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('test-inject');
    const ctx = trace.setSpan(ROOT_CONTEXT, span);

    const carrier: Record<string, string> = {};
    tracePropagator.inject(ctx, carrier, setter);
    span.end();

    expect(carrier['traceparent']).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/,
    );
  });

  it('traceparent contains the correct trace_id', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('inject-trace-id-check');
    const ctx = trace.setSpan(ROOT_CONTEXT, span);
    const traceId = span.spanContext().traceId;

    const carrier: Record<string, string> = {};
    tracePropagator.inject(ctx, carrier, setter);
    span.end();

    expect(carrier['traceparent']).toContain(traceId);
  });
});

// ── W3C TraceContext — extract ────────────────────────────────────────────

describe('W3CTraceContextPropagator — extract', () => {
  it('extracts trace_id from traceparent header', () => {
    const incomingTraceId = '11111111111111111111111111111111';
    const carrier = { traceparent: `00-${incomingTraceId}-2222222222222222-01` };

    const extractedCtx = tracePropagator.extract(ROOT_CONTEXT, carrier, getter);
    const spanCtx = trace.getSpanContext(extractedCtx);

    expect(spanCtx?.traceId).toBe(incomingTraceId);
    expect(spanCtx?.isRemote).toBe(true);
  });

  it('extracted context becomes parent of new span', () => {
    const incomingTraceId = 'aaaabbbbccccddddaaaabbbbccccdddd';
    const carrier = { traceparent: `00-${incomingTraceId}-1122334455667788-01` };

    const parentCtx = tracePropagator.extract(ROOT_CONTEXT, carrier, getter);

    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('child-span', {}, parentCtx);
    const spanCtx = span.spanContext();
    span.end();

    expect(spanCtx.traceId).toBe(incomingTraceId);
  });

  it('preserves trace_id across inject → extract round-trip', () => {
    const originalTraceId = 'deadbeefdeadbeefdeadbeefdeadbeef';

    const frontendSpanCtx = {
      traceId: originalTraceId,
      spanId: 'cafebabecafebabe',
      traceFlags: 1,
      isRemote: false,
    };
    const frontendCtx = trace.setSpanContext(ROOT_CONTEXT, frontendSpanCtx);

    const carrier: Record<string, string> = {};
    tracePropagator.inject(frontendCtx, carrier, setter);

    const backendCtx = tracePropagator.extract(ROOT_CONTEXT, carrier, getter);
    const extractedSpanCtx = trace.getSpanContext(backendCtx);

    expect(extractedSpanCtx?.traceId).toBe(originalTraceId);
  });

  it('ignores malformed traceparent (falls back to no span context)', () => {
    const carrier = { traceparent: 'not-a-valid-traceparent' };

    const extractedCtx = tracePropagator.extract(ROOT_CONTEXT, carrier, getter);
    const spanCtx = trace.getSpanContext(extractedCtx);

    expect(spanCtx?.isValid ?? false).toBe(false);
  });

  it('creates no span context when traceparent is absent', () => {
    const extractedCtx = tracePropagator.extract(ROOT_CONTEXT, {}, getter);
    const spanCtx = trace.getSpanContext(extractedCtx);

    expect(spanCtx).toBeUndefined();
  });
});

// ── Baggage extraction ────────────────────────────────────────────────────

describe('W3CBaggagePropagator — baggage extraction', () => {
  it('extracts baggage entries from incoming header', () => {
    const carrier = { baggage: 'page.route=home,user.id=usr_42,browser.name=Chrome' };

    const extractedCtx = baggagePropagator.extract(ROOT_CONTEXT, carrier, getter);
    const bag = propagation.getBaggage(extractedCtx);

    expect(bag?.getEntry('page.route')?.value).toBe('home');
    expect(bag?.getEntry('user.id')?.value).toBe('usr_42');
    expect(bag?.getEntry('browser.name')?.value).toBe('Chrome');
  });

  it('handles URL-encoded baggage values', () => {
    const carrier = { baggage: 'page.url=%2Fhello%3Fq%3D1,device.type=mobile' };

    const extractedCtx = baggagePropagator.extract(ROOT_CONTEXT, carrier, getter);
    const bag = propagation.getBaggage(extractedCtx);

    expect(bag?.getEntry('device.type')?.value).toBe('mobile');
  });

  it('extracts both traceparent and baggage from respective headers', () => {
    const incomingTraceId = '12345678901234567890123456789012';
    const traceCarrier = { traceparent: `00-${incomingTraceId}-abcdef1234567890-01` };
    const baggageCarrier = { baggage: 'page.route=orders,user.id=usr_99' };

    // Extract each header via its own propagator, then combine
    const ctxWithTrace = tracePropagator.extract(ROOT_CONTEXT, traceCarrier, getter);
    const ctxWithBoth = baggagePropagator.extract(ctxWithTrace, baggageCarrier, getter);

    expect(trace.getSpanContext(ctxWithBoth)?.traceId).toBe(incomingTraceId);
    expect(propagation.getBaggage(ctxWithBoth)?.getEntry('page.route')?.value).toBe('orders');
    expect(propagation.getBaggage(ctxWithBoth)?.getEntry('user.id')?.value).toBe('usr_99');
  });

  it('injects baggage into outgoing headers', () => {
    const bag = propagation.createBaggage({
      'page.route': { value: 'dashboard' },
      'user.id': { value: 'usr_10' },
    });
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);

    const carrier: Record<string, string> = {};
    baggagePropagator.inject(ctx, carrier, setter);

    expect(carrier['baggage']).toContain('page.route=dashboard');
    expect(carrier['baggage']).toContain('user.id=usr_10');
  });
});

// ── ATTR_TEST_RUN_ID constant ─────────────────────────────────────────────

describe('ATTR_TEST_RUN_ID', () => {
  it("has value 'test.run_id'", () => {
    expect(ATTR_TEST_RUN_ID).toBe('test.run_id');
  });

  it('can be set as a span attribute', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('test-correlation');
    span.setAttribute(ATTR_TEST_RUN_ID, 'propagation-test-001');
    span.end();

    const spans = exporter.getFinishedSpans();
    const testSpan = spans.find(s => s.name === 'test-correlation');
    expect(testSpan?.attributes[ATTR_TEST_RUN_ID]).toBe('propagation-test-001');
  });
});

// ── Multi-hop chain ───────────────────────────────────────────────────────

describe('Distributed trace — multi-hop chain', () => {
  it('all hops in Frontend → NestJS → Express → Laravel share the same trace_id', () => {
    const frontendTraceId = 'fedcba9876543210fedcba9876543210';

    // Frontend creates a span and injects traceparent
    const frontendCtx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: frontendTraceId,
      spanId: 'fe001234fe001234',
      traceFlags: 1,
      isRemote: false,
    });
    const frontendToNest: Record<string, string> = {};
    tracePropagator.inject(frontendCtx, frontendToNest, setter);

    // NestJS extracts → must have same trace_id
    const nestCtxIn = tracePropagator.extract(ROOT_CONTEXT, frontendToNest, getter);
    const nestSpan = provider.getTracer('nestjs').startSpan(
      'GET /chain',
      { kind: SpanKind.SERVER },
      nestCtxIn,
    );
    expect(nestSpan.spanContext().traceId).toBe(frontendTraceId);

    // NestJS injects into outgoing call to Express
    const nestCtxOut = trace.setSpan(nestCtxIn, nestSpan);
    const nestToExpress: Record<string, string> = {};
    tracePropagator.inject(nestCtxOut, nestToExpress, setter);

    // Express extracts → same trace_id
    const expressCtxIn = tracePropagator.extract(ROOT_CONTEXT, nestToExpress, getter);
    const expressSpan = provider.getTracer('express').startSpan(
      'GET /chain',
      { kind: SpanKind.SERVER },
      expressCtxIn,
    );
    expect(expressSpan.spanContext().traceId).toBe(frontendTraceId);

    // Express injects into outgoing call to Laravel
    const expressCtxOut = trace.setSpan(expressCtxIn, expressSpan);
    const expressToLaravel: Record<string, string> = {};
    tracePropagator.inject(expressCtxOut, expressToLaravel, setter);

    // Laravel extracts (simulated via W3C) → same trace_id
    const laravelCtxIn = tracePropagator.extract(ROOT_CONTEXT, expressToLaravel, getter);
    expect(trace.getSpanContext(laravelCtxIn)?.traceId).toBe(frontendTraceId);

    expressSpan.end();
    nestSpan.end();
  });
});
