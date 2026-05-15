// @vitest-environment node
/**
 * Unit tests for W3C trace context propagation in the web package.
 *
 * Covers:
 * 1. apiUrls URL matching (propagateTraceHeaderCorsUrls behaviour)
 * 2. apiUrlsAsWhitelist enforcement (minimal profile)
 * 3. ignoreUrls filtering
 * 4. HaocEnrichedBaggagePropagator inject/extract
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  context,
  propagation,
  trace,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} from '@opentelemetry/core';
import { matchesAny } from '../src/profile';
import { HaocEnrichedBaggagePropagator } from '../src/haoc-baggage-propagator';
import type { BrowserInfo } from '../src/browser';
import { setUser, clearUser } from '../src/identity';
import { setCurrentRoute } from '../src/processor';

// ── helpers ──────────────────────────────────────────────────────────────

function buildCarrier(): Record<string, string> {
  return {};
}

function textMapGetterFromRecord(carrier: Record<string, string>) {
  return {
    get: (c: Record<string, string>, key: string) => c[key],
    keys: (c: Record<string, string>) => Object.keys(c),
  };
}

function textMapSetterFromRecord(carrier: Record<string, string>) {
  return {
    set: (c: Record<string, string>, key: string, value: string) => {
      c[key] = value;
    },
  };
}

const BROWSER_INFO: BrowserInfo = {
  'browser.name': 'Chrome',
  'browser.version': '120',
  'os.name': 'Linux',
  'device.type': 'desktop',
  'app.platform': 'web',
};

// ── apiUrls URL matching ──────────────────────────────────────────────────

describe('apiUrls — URL matching for propagateTraceHeaderCorsUrls', () => {
  const apiUrls = [/localhost:(3010|3020|8085)/];

  it('matches NestJS URL', () => {
    expect(matchesAny(apiUrls, 'http://localhost:3010/hello')).toBe(true);
  });

  it('matches Express URL', () => {
    expect(matchesAny(apiUrls, 'http://localhost:3020/hello')).toBe(true);
  });

  it('matches Laravel URL', () => {
    expect(matchesAny(apiUrls, 'http://localhost:8085/api/hello')).toBe(true);
  });

  it('matches URLs with path suffixes', () => {
    expect(matchesAny(apiUrls, 'http://localhost:3010/proxy/express')).toBe(true);
    expect(matchesAny(apiUrls, 'http://localhost:3010/chain')).toBe(true);
    expect(matchesAny(apiUrls, 'http://localhost:3010/debug/headers')).toBe(true);
  });

  it('does NOT match other ports', () => {
    expect(matchesAny(apiUrls, 'http://localhost:4318/v1/traces')).toBe(false);
    expect(matchesAny(apiUrls, 'http://localhost:3301/api')).toBe(false);
    expect(matchesAny(apiUrls, 'http://other-host:3010/hello')).toBe(false);
  });

  it('does NOT match external URLs', () => {
    expect(matchesAny(apiUrls, 'https://api.example.com/v1/users')).toBe(false);
  });

  it('matches with trailing slash', () => {
    expect(matchesAny(apiUrls, 'http://localhost:3010/')).toBe(true);
  });

  it('string pattern also works', () => {
    const stringPatterns = ['localhost:3010', 'localhost:3020'];
    const compiled = stringPatterns.map(p => new RegExp(p, 'i'));
    expect(matchesAny(compiled, 'http://localhost:3010/hello')).toBe(true);
    expect(matchesAny(compiled, 'http://localhost:3020/hello')).toBe(true);
    expect(matchesAny(compiled, 'http://localhost:8085/api/hello')).toBe(false);
  });
});

// ── ignoreUrls filtering ──────────────────────────────────────────────────

describe('ignoreUrls — URLs that should not produce spans', () => {
  const ignoreUrls = [
    /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map)(\?|$)/i,
  ];

  it('ignores static JS bundles', () => {
    expect(matchesAny(ignoreUrls, 'http://localhost:8090/assets/main.js')).toBe(true);
    expect(matchesAny(ignoreUrls, 'http://cdn.example.com/app.min.css')).toBe(true);
  });

  it('does not ignore API URLs', () => {
    expect(matchesAny(ignoreUrls, 'http://localhost:3010/hello')).toBe(false);
    expect(matchesAny(ignoreUrls, 'http://localhost:3020/chain')).toBe(false);
  });

  it('ignores OTLP collector URL', () => {
    const withCollector = [...ignoreUrls, /localhost:4318/];
    expect(matchesAny(withCollector, 'http://localhost:4318/v1/traces')).toBe(true);
  });
});

// ── shouldTraceUrl logic ──────────────────────────────────────────────────

describe('shouldTraceUrl — whitelist logic (minimal profile)', () => {
  const apiUrls = [/localhost:(3010|3020|8085)/];
  const ignoreUrls = [/\.js(\?|$)/i];

  /**
   * Replicates the logic inside initTracing():
   *   if matchesAny(ignoreUrls, url) → false
   *   if apiUrlsAsWhitelist && apiUrls.length > 0 → only if matches apiUrls
   */
  function shouldTrace(url: string, apiUrlsAsWhitelist = true): boolean {
    if (matchesAny(ignoreUrls, url)) return false;
    if (apiUrlsAsWhitelist && apiUrls.length > 0) {
      return matchesAny(apiUrls, url);
    }
    return true;
  }

  it('allows API URLs in whitelist mode', () => {
    expect(shouldTrace('http://localhost:3010/hello', true)).toBe(true);
  });

  it('blocks non-API URLs in whitelist mode', () => {
    expect(shouldTrace('http://localhost:4318/v1/traces', true)).toBe(false);
    expect(shouldTrace('https://fonts.googleapis.com/css2', true)).toBe(false);
  });

  it('blocks ignored URLs regardless of whitelist mode', () => {
    expect(shouldTrace('http://localhost:3010/assets/app.js', true)).toBe(false);
    expect(shouldTrace('http://localhost:3010/assets/app.js', false)).toBe(false);
  });

  it('allows all non-ignored URLs when whitelist is off', () => {
    expect(shouldTrace('https://fonts.googleapis.com/css2', false)).toBe(true);
    expect(shouldTrace('http://localhost:4318/v1/traces', false)).toBe(true);
  });
});

// ── HaocEnrichedBaggagePropagator ────────────────────────────────────────

describe('HaocEnrichedBaggagePropagator — inject', () => {
  let originalPropagator: ReturnType<typeof propagation.fields> extends never ? never : unknown;

  beforeEach(() => {
    // Register a minimal propagator for the test
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [new W3CBaggagePropagator()],
      }),
    );
    clearUser();
  });

  afterEach(() => {
    clearUser();
  });

  it('injects browser info into baggage header', () => {
    const propagatorUnderTest = new HaocEnrichedBaggagePropagator(BROWSER_INFO);
    const carrier = buildCarrier();
    const setter = textMapSetterFromRecord(carrier);

    propagatorUnderTest.inject(ROOT_CONTEXT, carrier, setter);

    expect(carrier['baggage']).toBeDefined();
    expect(carrier['baggage']).toContain('device.type=desktop');
    expect(carrier['baggage']).toContain('browser.name=Chrome');
    expect(carrier['baggage']).toContain('app.platform=web');
  });

  it('injects user.id when user is set', () => {
    setUser({ id: 'usr_test_42', type: 'authenticated' });

    const propagatorUnderTest = new HaocEnrichedBaggagePropagator(BROWSER_INFO);
    const carrier = buildCarrier();
    const setter = textMapSetterFromRecord(carrier);

    propagatorUnderTest.inject(ROOT_CONTEXT, carrier, setter);

    expect(carrier['baggage']).toContain('user.id=usr_test_42');
  });

  it('does not add user.id when no user is set', () => {
    const propagatorUnderTest = new HaocEnrichedBaggagePropagator(BROWSER_INFO);
    const carrier = buildCarrier();
    const setter = textMapSetterFromRecord(carrier);

    propagatorUnderTest.inject(ROOT_CONTEXT, carrier, setter);

    expect(carrier['baggage'] ?? '').not.toContain('user.id=');
  });

  it('extracts baggage entries from incoming carrier', () => {
    const propagatorUnderTest = new HaocEnrichedBaggagePropagator(BROWSER_INFO);
    const carrier = { baggage: 'page.route=home,user.id=usr_42' };
    const getter = textMapGetterFromRecord(carrier);

    const ctx = propagatorUnderTest.extract(ROOT_CONTEXT, carrier, getter);
    const bag = propagation.getBaggage(ctx);

    expect(bag?.getEntry('page.route')?.value).toBe('home');
    expect(bag?.getEntry('user.id')?.value).toBe('usr_42');
  });

  it('fields() returns the baggage field name', () => {
    const propagatorUnderTest = new HaocEnrichedBaggagePropagator(BROWSER_INFO);
    expect(propagatorUnderTest.fields()).toContain('baggage');
  });
});

// ── W3C TraceContext propagator — inject/extract round trip ──────────────

describe('W3CTraceContextPropagator — traceparent round trip', () => {
  it('injects traceparent header with active span context', () => {
    const propagatorUnderTest = new W3CTraceContextPropagator();

    // Create a fake span context
    const spanContext = {
      traceId: 'aaaabbbbccccddddaaaabbbbccccdddd',
      spanId: '1122334455667788',
      traceFlags: 1,
      isRemote: false,
    };
    const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

    const carrier = buildCarrier();
    const setter = textMapSetterFromRecord(carrier);
    propagatorUnderTest.inject(ctx, carrier, setter);

    expect(carrier['traceparent']).toBe(
      '00-aaaabbbbccccddddaaaabbbbccccdddd-1122334455667788-01',
    );
  });

  it('extracts traceparent and sets span context', () => {
    const propagatorUnderTest = new W3CTraceContextPropagator();
    const carrier = {
      traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
    };
    const getter = textMapGetterFromRecord(carrier);

    const ctx = propagatorUnderTest.extract(ROOT_CONTEXT, carrier, getter);
    const spanCtx = trace.getSpanContext(ctx);

    expect(spanCtx?.traceId).toBe('11111111111111111111111111111111');
    expect(spanCtx?.spanId).toBe('2222222222222222');
    expect(spanCtx?.isRemote).toBe(true);
  });

  it('preserves trace_id across inject/extract cycle', () => {
    const propagatorUnderTest = new W3CTraceContextPropagator();
    const originalTraceId = 'abcdef0123456789abcdef0123456789';

    const spanContext = {
      traceId: originalTraceId,
      spanId: 'fedcba9876543210',
      traceFlags: 1,
      isRemote: false,
    };
    const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

    // Inject
    const carrier = buildCarrier();
    const setter = textMapSetterFromRecord(carrier);
    propagatorUnderTest.inject(ctx, carrier, setter);

    // Extract
    const getter = textMapGetterFromRecord(carrier);
    const extractedCtx = propagatorUnderTest.extract(ROOT_CONTEXT, carrier, getter);
    const extractedSpanCtx = trace.getSpanContext(extractedCtx);

    expect(extractedSpanCtx?.traceId).toBe(originalTraceId);
  });
});
