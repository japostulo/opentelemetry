// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetRuntimeProfileCache,
  getRuntimeProfile,
  matchesAny,
  parsePatternList,
  resolveProfile,
  type OtelProfileName,
} from '../src/tracing/profile';

const HAOC_KEYS = [
  'OTEL_PROFILE',
  'OTEL_SAMPLE_RATIO',
  'OTEL_IGNORE_URLS',
  'OTEL_IGNORE_OUTGOING_URLS',
  'OTEL_IGNORE_ROUTES',
  'OTEL_EXPRESS_IGNORE_LAYERS',
  'OTEL_CAPTURE_BODY',
  'OTEL_CAPTURE_RESPONSE',
  'OTEL_RESOLVED_PROFILE',
  'OTEL_TRACE_HTTP',
  'OTEL_TRACE_EXPRESS',
  'OTEL_TRACE_NESTJS',
  'OTEL_TRACE_PG',
  'OTEL_TRACE_MYSQL',
  'OTEL_TRACE_MYSQL2',
  'OTEL_TRACE_MONGODB',
  'OTEL_TRACE_IOREDIS',
  'OTEL_TRACE_REDIS',
  'OTEL_TRACE_PINO',
  'OTEL_TRACE_FS',
  'OTEL_TRACE_NET',
  'OTEL_TRACE_DNS',
];

let snapshot: Record<string, string | undefined>;

function clearHaocEnv(): void {
  for (const k of HAOC_KEYS) delete process.env[k];
}

beforeEach(() => {
  snapshot = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
  };
  for (const k of HAOC_KEYS) snapshot[k] = process.env[k];
  clearHaocEnv();
  // Tests should not depend on the host's NODE_ENV/APP_ENV values.
  delete process.env.NODE_ENV;
  delete process.env.APP_ENV;
  _resetRuntimeProfileCache();
});

afterEach(() => {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  _resetRuntimeProfileCache();
});

// ───────────────────────────────────────────────────────────────────────
// parsePatternList
// ───────────────────────────────────────────────────────────────────────
describe('parsePatternList', () => {
  it('returns [] for undefined / null', () => {
    expect(parsePatternList(undefined)).toEqual([]);
    expect(parsePatternList(null as unknown as string)).toEqual([]);
  });

  it('splits CSV strings, trims, and ignores empty segments', () => {
    const out = parsePatternList(' ^/foo$ , ,bar*');
    expect(out).toHaveLength(2);
    // Don't assert on RegExp.source (engines may escape `/`); use behaviour.
    expect(out[0].test('/foo')).toBe(true);
    expect(out[1].test('barrrr')).toBe(true);
  });

  it('keeps RegExp instances as-is', () => {
    const re = /^x$/u;
    expect(parsePatternList([re])[0]).toBe(re);
  });

  it('compiles every entry with case-insensitive flag', () => {
    const [re] = parsePatternList(['ABC']);
    expect(re.flags).toContain('i');
    expect(re.test('abc')).toBe(true);
  });

  it('skips invalid regex sources silently', () => {
    const out = parsePatternList(['(', 'good']);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('good');
  });

  it('accepts mixed string/RegExp arrays', () => {
    const out = parsePatternList(['foo', /bar/i]);
    expect(out).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────────────
// matchesAny
// ───────────────────────────────────────────────────────────────────────
describe('matchesAny', () => {
  it('returns false when no patterns', () => {
    expect(matchesAny([], 'anything')).toBe(false);
  });

  it('returns true on first match', () => {
    expect(matchesAny([/x/, /^foo$/i], 'FOO')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesAny([/^bar$/], 'foo')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — defaults + named profiles
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — named profiles', () => {
  it('defaults to minimal when nothing is set', () => {
    const p = resolveProfile({ ignoreEnv: true });
    expect(p.profile).toBe('minimal');
    expect(p.captureRequestBody).toBe(false);
    expect(p.captureResponseBody).toBe(false);
    // minimal deve ter logBody OFF — sem body nos logs ou spans
    expect(p.logRequestBody).toBe(false);
    expect(p.logResponseBody).toBe(false);
    expect(p.expressIgnoreLayers).toEqual(['middleware', 'router', 'request_handler']);
    expect(p.instrumentations.fs).toBe(false);
    expect(p.instrumentations.http).toBe(true);
    expect(p.instrumentations.pg).toBe(true);
    // Static asset + default health/metrics paths must be present.
    expect(p.ignoreIncomingPaths.some((re) => re.test('/health'))).toBe(true);
    expect(p.ignoreIncomingPaths.some((re) => re.test('/foo.js'))).toBe(true);
    expect(p.ignoreIncomingPaths.some((re) => re.test('/api/users'))).toBe(false);
  });

  it('returns the standard profile shape', () => {
    const p = resolveProfile({ profile: 'standard', ignoreEnv: true });
    expect(p.profile).toBe('standard');
    // standard does NOT flatten body into span attributes (Atividade 2 fix)
    expect(p.captureRequestBody).toBe(false);
    expect(p.captureResponseBody).toBe(false);
    expect(p.expressIgnoreLayers).toEqual(['middleware']);
    expect(p.instrumentations.mysql).toBe(true);
    // Static asset filter is OFF in standard.
    expect(p.ignoreIncomingPaths.some((re) => re.test('/foo.js'))).toBe(false);
    // But /health is still ignored.
    expect(p.ignoreIncomingPaths.some((re) => re.test('/health'))).toBe(true);
  });

  it('returns the verbose profile shape (no filters)', () => {
    const p = resolveProfile({ profile: 'verbose', ignoreEnv: true });
    expect(p.profile).toBe('verbose');
    expect(p.expressIgnoreLayers).toEqual([]);
    expect(p.ignoreIncomingPaths).toEqual([]);
    expect(p.instrumentations.fs).toBe(true);
    expect(p.instrumentations.dns).toBe(true);
    expect(p.captureRequestBody).toBe(true);
    expect(p.captureResponseBody).toBe(true);
  });

  it('falls back to minimal when an unknown profile name is passed', () => {
    // Cast to bypass TS check; runtime should still recover.
    const p = resolveProfile({
      profile: 'bogus' as OtelProfileName,
      ignoreEnv: true,
    });
    // The profile name field reflects what the caller asked for...
    expect(p.profile).toBe('bogus');
    // ... but the baseline used must be minimal's.
    expect(p.captureRequestBody).toBe(false);
    expect(p.expressIgnoreLayers).toEqual(['middleware', 'router', 'request_handler']);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — sample ratio precedence
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — sample ratio', () => {
  it('uses base ratio when nothing is overridden', () => {
    const p = resolveProfile({ ignoreEnv: true });
    expect(p.sampleRatio).toBe(1.0);
  });

  it('reads OTEL_SAMPLE_RATIO from env', () => {
    process.env.OTEL_SAMPLE_RATIO = '0.42';
    const p = resolveProfile();
    expect(p.sampleRatio).toBeCloseTo(0.42);
  });

  it('explicit override beats env', () => {
    process.env.OTEL_SAMPLE_RATIO = '0.42';
    const p = resolveProfile({ sampleRatio: 0.99 });
    expect(p.sampleRatio).toBeCloseTo(0.99);
  });

  it('drops to 0.2 in production for non-verbose with no override', () => {
    process.env.NODE_ENV = 'production';
    const minimal = resolveProfile();
    const standard = resolveProfile({ profile: 'standard' });
    expect(minimal.sampleRatio).toBe(0.2);
    expect(standard.sampleRatio).toBe(0.2);
  });

  it('keeps verbose at 1.0 even in production', () => {
    process.env.NODE_ENV = 'production';
    const v = resolveProfile({ profile: 'verbose' });
    expect(v.sampleRatio).toBe(1.0);
  });

  it('respects APP_ENV=production as well', () => {
    process.env.APP_ENV = 'production';
    expect(resolveProfile().sampleRatio).toBe(0.2);
  });

  it('does not auto-drop when an explicit ratio is provided', () => {
    process.env.NODE_ENV = 'production';
    process.env.OTEL_SAMPLE_RATIO = '0.5';
    expect(resolveProfile().sampleRatio).toBeCloseTo(0.5);
  });

  it('rejects out-of-range or non-numeric env values', () => {
    process.env.OTEL_SAMPLE_RATIO = '5';
    expect(resolveProfile().sampleRatio).toBe(1.0);
    process.env.OTEL_SAMPLE_RATIO = 'NaN';
    expect(resolveProfile().sampleRatio).toBe(1.0);
    process.env.OTEL_SAMPLE_RATIO = '-0.1';
    expect(resolveProfile().sampleRatio).toBe(1.0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — ignore lists
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — ignore lists', () => {
  it('merges base + env + override for ignoreIncomingPaths', () => {
    process.env.OTEL_IGNORE_URLS = '^/from-env$';
    const p = resolveProfile({
      ignoreIncomingPaths: ['^/from-override$'],
    });
    expect(matchesAny(p.ignoreIncomingPaths, '/health')).toBe(true);
    expect(matchesAny(p.ignoreIncomingPaths, '/from-env')).toBe(true);
    expect(matchesAny(p.ignoreIncomingPaths, '/from-override')).toBe(true);
  });

  it('exposes ignoreOutgoingUrls from env + override', () => {
    process.env.OTEL_IGNORE_OUTGOING_URLS = 'tasy.haoc';
    const p = resolveProfile({
      ignoreOutgoingUrls: [/internal\.svc/],
    });
    expect(matchesAny(p.ignoreOutgoingUrls, 'http://tasy.haoc.com.br/x')).toBe(true);
    expect(matchesAny(p.ignoreOutgoingUrls, 'http://internal.svc/x')).toBe(true);
  });

  it('exposes ignoreRoutes from env + override', () => {
    process.env.OTEL_IGNORE_ROUTES = '^/admin$';
    const p = resolveProfile({ ignoreRoutes: [/^\/queue/] });
    expect(matchesAny(p.ignoreRoutes, '/admin')).toBe(true);
    expect(matchesAny(p.ignoreRoutes, '/queue/x')).toBe(true);
    expect(matchesAny(p.ignoreRoutes, '/api/users')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — body capture & express layers
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — body capture toggles', () => {
  it('reads OTEL_CAPTURE_BODY (true/false/yes/no/1/0/on/off)', () => {
    for (const truthy of ['true', '1', 'yes', 'on']) {
      process.env.OTEL_CAPTURE_BODY = truthy;
      expect(resolveProfile().captureRequestBody).toBe(true);
    }
    for (const falsy of ['false', '0', 'no', 'off']) {
      process.env.OTEL_CAPTURE_BODY = falsy;
      expect(resolveProfile().captureRequestBody).toBe(false);
    }
  });

  it('explicit override beats env', () => {
    process.env.OTEL_CAPTURE_BODY = 'true';
    expect(
      resolveProfile({ captureRequestBody: false }).captureRequestBody,
    ).toBe(false);
  });

  it('falls back to base default for invalid env values', () => {
    process.env.OTEL_CAPTURE_BODY = 'maybe';
    // minimal default is false
    expect(resolveProfile().captureRequestBody).toBe(false);
  });

  it('reads OTEL_EXPRESS_IGNORE_LAYERS as CSV', () => {
    process.env.OTEL_EXPRESS_IGNORE_LAYERS =
      'middleware, request_handler ,router';
    expect(resolveProfile().expressIgnoreLayers).toEqual([
      'middleware',
      'request_handler',
      'router',
    ]);
  });

  it('explicit expressIgnoreLayers wins over env', () => {
    process.env.OTEL_EXPRESS_IGNORE_LAYERS = 'middleware,router';
    expect(
      resolveProfile({ expressIgnoreLayers: [] }).expressIgnoreLayers,
    ).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — per-instrumentation env toggles
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — per-instrumentation toggles', () => {
  it('OTEL_TRACE_FS=true enables fs in minimal', () => {
    process.env.OTEL_TRACE_FS = 'true';
    expect(resolveProfile().instrumentations.fs).toBe(true);
  });

  it('OTEL_TRACE_HTTP=false disables http in minimal', () => {
    process.env.OTEL_TRACE_HTTP = 'false';
    expect(resolveProfile().instrumentations.http).toBe(false);
  });

  it('explicit instrumentations override env', () => {
    process.env.OTEL_TRACE_PG = 'false';
    expect(
      resolveProfile({ instrumentations: { pg: true } }).instrumentations.pg,
    ).toBe(true);
  });

  it('invalid bool env values are silently ignored (base wins)', () => {
    process.env.OTEL_TRACE_FS = 'sometimes';
    expect(resolveProfile().instrumentations.fs).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveProfile — profile name from env
// ───────────────────────────────────────────────────────────────────────
describe('resolveProfile — profile selection from env', () => {
  it('reads OTEL_PROFILE', () => {
    process.env.OTEL_PROFILE = 'verbose';
    expect(resolveProfile().profile).toBe('verbose');
  });

  it('explicit profile arg beats env', () => {
    process.env.OTEL_PROFILE = 'verbose';
    expect(resolveProfile({ profile: 'minimal' }).profile).toBe('minimal');
  });

  it('ignoreEnv:true skips env vars entirely', () => {
    process.env.OTEL_PROFILE = 'verbose';
    process.env.OTEL_SAMPLE_RATIO = '0.1';
    process.env.OTEL_TRACE_FS = 'true';
    const p = resolveProfile({ ignoreEnv: true });
    expect(p.profile).toBe('minimal');
    expect(p.sampleRatio).toBe(1.0);
    expect(p.instrumentations.fs).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// getRuntimeProfile (read JSON stash)
// ───────────────────────────────────────────────────────────────────────
describe('getRuntimeProfile', () => {
  it('falls back to minimal when no env stash exists', () => {
    const r = getRuntimeProfile();
    expect(r.profile).toBe('minimal');
    expect(r.captureRequestBody).toBe(false);
    expect(r.captureResponseBody).toBe(false);
    expect(r.ignoreRoutes).toEqual([]);
  });

  it('parses OTEL_RESOLVED_PROFILE and compiles ignoreRoutes', () => {
    process.env.OTEL_RESOLVED_PROFILE = JSON.stringify({
      profile: 'standard',
      captureRequestBody: true,
      captureResponseBody: false,
      ignoreRoutes: ['^/admin$', '^/queue/'],
    });
    const r = getRuntimeProfile();
    expect(r.profile).toBe('standard');
    expect(r.captureRequestBody).toBe(true);
    expect(r.captureResponseBody).toBe(false);
    expect(r.ignoreRoutes).toHaveLength(2);
    expect(matchesAny(r.ignoreRoutes, '/admin')).toBe(true);
    expect(matchesAny(r.ignoreRoutes, '/queue/abc')).toBe(true);
  });

  it('memoises across calls', () => {
    process.env.OTEL_RESOLVED_PROFILE = JSON.stringify({
      profile: 'verbose',
      captureRequestBody: true,
      captureResponseBody: true,
      ignoreRoutes: [],
    });
    const a = getRuntimeProfile();
    // Mutate env without resetting cache.
    delete process.env.OTEL_RESOLVED_PROFILE;
    const b = getRuntimeProfile();
    expect(b).toBe(a);
  });

  it('_resetRuntimeProfileCache forces re-read', () => {
    process.env.OTEL_RESOLVED_PROFILE = JSON.stringify({
      profile: 'verbose',
      captureRequestBody: true,
      captureResponseBody: true,
      ignoreRoutes: [],
    });
    const a = getRuntimeProfile();
    delete process.env.OTEL_RESOLVED_PROFILE;
    _resetRuntimeProfileCache();
    const b = getRuntimeProfile();
    expect(b).not.toBe(a);
    expect(b.profile).toBe('minimal');
  });

  it('falls back to minimal on malformed JSON', () => {
    process.env.OTEL_RESOLVED_PROFILE = 'not-json';
    const r = getRuntimeProfile();
    expect(r.profile).toBe('minimal');
  });
});
