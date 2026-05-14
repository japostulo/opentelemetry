// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  matchesAny,
  parsePatternList,
  resolveWebProfile,
  type OtelWebProfileName,
} from '../src/profile';

// ───────────────────────────────────────────────────────────────────────
// parsePatternList
// ───────────────────────────────────────────────────────────────────────
describe('web parsePatternList', () => {
  it('returns [] for undefined / null', () => {
    expect(parsePatternList(undefined)).toEqual([]);
    expect(parsePatternList(null as unknown as string)).toEqual([]);
  });

  it('splits CSV strings, trims, ignores empties', () => {
    const out = parsePatternList(' a , ,b');
    expect(out).toHaveLength(2);
    expect(out[0].test('a')).toBe(true);
    expect(out[1].test('b')).toBe(true);
  });

  it('preserves RegExp instances and skips invalid sources', () => {
    const re = /x/u;
    const out = parsePatternList([re, '(', 'good']);
    expect(out[0]).toBe(re);
    expect(out).toHaveLength(2);
    expect(out[1].source).toBe('good');
  });
});

// ───────────────────────────────────────────────────────────────────────
// matchesAny
// ───────────────────────────────────────────────────────────────────────
describe('web matchesAny', () => {
  it('returns false when no patterns', () => {
    expect(matchesAny([], 'foo')).toBe(false);
  });
  it('returns true on first hit', () => {
    expect(matchesAny([/^foo$/i], 'FOO')).toBe(true);
  });
  it('returns false when nothing hits', () => {
    expect(matchesAny([/^bar$/], 'foo')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveWebProfile — named profiles
// ───────────────────────────────────────────────────────────────────────
describe('resolveWebProfile — named profiles', () => {
  it('defaults to minimal', () => {
    const p = resolveWebProfile({ env: {} });
    expect(p.profile).toBe('minimal');
    expect(p.enableDocumentLoad).toBe(false);
    expect(p.enableErrorTracking).toBe(true);
    expect(p.apiUrlsAsWhitelist).toBe(true);
    // Minimal must filter common static assets and noisy errors.
    expect(matchesAny(p.ignoreUrls, 'https://cdn/foo.js')).toBe(true);
    expect(matchesAny(p.ignoreUrls, 'https://cdn/bar.png')).toBe(true);
    expect(matchesAny(p.ignoreUrls, 'https://api/users')).toBe(false);
    expect(
      matchesAny(p.ignoreErrorMessages, 'ResizeObserver loop limit exceeded'),
    ).toBe(true);
    expect(matchesAny(p.ignoreErrorMessages, 'Script error.')).toBe(true);
  });

  it('returns the standard shape', () => {
    const p = resolveWebProfile({ profile: 'standard', env: {} });
    expect(p.profile).toBe('standard');
    expect(p.enableDocumentLoad).toBe(true);
    expect(p.apiUrlsAsWhitelist).toBe(false);
    // Static assets still filtered; noisy errors still ignored.
    expect(matchesAny(p.ignoreUrls, '/x.js')).toBe(true);
  });

  it('returns the verbose shape (no filters)', () => {
    const p = resolveWebProfile({ profile: 'verbose', env: {} });
    expect(p.profile).toBe('verbose');
    expect(p.ignoreUrls).toEqual([]);
    expect(p.ignoreErrorMessages).toEqual([]);
    expect(p.enableDocumentLoad).toBe(true);
    expect(p.apiUrlsAsWhitelist).toBe(false);
  });

  it('falls back to minimal baseline on unknown profile names', () => {
    const p = resolveWebProfile({
      profile: 'bogus' as OtelWebProfileName,
      env: {},
    });
    expect(p.enableDocumentLoad).toBe(false);
    expect(p.apiUrlsAsWhitelist).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// resolveWebProfile — env precedence (OTEL_* and VITE_OTEL_*)
// ───────────────────────────────────────────────────────────────────────
describe('resolveWebProfile — env-driven values', () => {
  it('reads VITE_OTEL_PROFILE when OTEL_PROFILE is absent', () => {
    const p = resolveWebProfile({ env: { VITE_OTEL_PROFILE: 'verbose' } });
    expect(p.profile).toBe('verbose');
  });

  it('OTEL_PROFILE wins over VITE_OTEL_PROFILE', () => {
    const p = resolveWebProfile({
      env: {
        OTEL_PROFILE: 'standard',
        VITE_OTEL_PROFILE: 'verbose',
      },
    });
    expect(p.profile).toBe('standard');
  });

  it('explicit profile overrides env', () => {
    const p = resolveWebProfile({
      profile: 'minimal',
      env: { OTEL_PROFILE: 'verbose' },
    });
    expect(p.profile).toBe('minimal');
  });

  it('reads OTEL_SAMPLE_RATIO and clamps invalid values', () => {
    expect(
      resolveWebProfile({ env: { OTEL_SAMPLE_RATIO: '0.3' } })
        .sampleRatio,
    ).toBeCloseTo(0.3);
    expect(
      resolveWebProfile({ env: { OTEL_SAMPLE_RATIO: 'NaN' } })
        .sampleRatio,
    ).toBe(1.0);
    expect(
      resolveWebProfile({ env: { OTEL_SAMPLE_RATIO: '5' } }).sampleRatio,
    ).toBe(1.0);
  });

  it('reads OTEL_IGNORE_URLS as CSV', () => {
    // CSV split is on `,`, so individual patterns must not contain commas.
    const p = resolveWebProfile({
      env: { OTEL_IGNORE_URLS: 'socket\\.io|polling, ^https?://noise' },
    });
    expect(matchesAny(p.ignoreUrls, '/socket.io/poll')).toBe(true);
    expect(matchesAny(p.ignoreUrls, 'https://noise.example')).toBe(true);
  });

  it('reads OTEL_IGNORE_ERRORS as CSV', () => {
    const p = resolveWebProfile({
      env: { OTEL_IGNORE_ERRORS: '^Custom error' },
    });
    expect(matchesAny(p.ignoreErrorMessages, 'Custom error: x')).toBe(true);
    // Default noisy ones still apply (merged).
    expect(matchesAny(p.ignoreErrorMessages, 'Script error.')).toBe(true);
  });

  it('reads OTEL_DOCUMENT_LOAD bool toggles', () => {
    expect(
      resolveWebProfile({ env: { OTEL_DOCUMENT_LOAD: 'true' } })
        .enableDocumentLoad,
    ).toBe(true);
    expect(
      resolveWebProfile({
        profile: 'verbose',
        env: { OTEL_DOCUMENT_LOAD: 'false' },
      }).enableDocumentLoad,
    ).toBe(false);
  });

  it('reads OTEL_API_WHITELIST', () => {
    expect(
      resolveWebProfile({
        profile: 'verbose',
        env: { OTEL_API_WHITELIST: 'true' },
      }).apiUrlsAsWhitelist,
    ).toBe(true);
    expect(
      resolveWebProfile({
        profile: 'minimal',
        env: { OTEL_API_WHITELIST: 'false' },
      }).apiUrlsAsWhitelist,
    ).toBe(false);
  });

  it('explicit overrides beat env in every field', () => {
    const p = resolveWebProfile({
      profile: 'verbose',
      env: {
        OTEL_SAMPLE_RATIO: '0.1',
        OTEL_DOCUMENT_LOAD: 'false',
      },
      sampleRatio: 0.7,
      enableDocumentLoad: true,
      apiUrlsAsWhitelist: true,
    });
    expect(p.sampleRatio).toBeCloseTo(0.7);
    expect(p.enableDocumentLoad).toBe(true);
    expect(p.apiUrlsAsWhitelist).toBe(true);
  });
});

describe('resolveWebProfile — env merging', () => {
  it('merges base ignoreUrls with env + override (no double-counting)', () => {
    const p = resolveWebProfile({
      env: { OTEL_IGNORE_URLS: 'foo' },
      ignoreUrls: ['bar'],
    });
    // Base has 1 (static asset), env adds 1, override adds 1.
    expect(p.ignoreUrls).toHaveLength(3);
    expect(matchesAny(p.ignoreUrls, '/x.js')).toBe(true);
    expect(matchesAny(p.ignoreUrls, '/foo')).toBe(true);
    expect(matchesAny(p.ignoreUrls, '/bar')).toBe(true);
  });

  it('falls back to globalThis.process.env when env is absent', () => {
    const before = process.env.OTEL_PROFILE;
    process.env.OTEL_PROFILE = 'verbose';
    try {
      const p = resolveWebProfile();
      expect(p.profile).toBe('verbose');
    } finally {
      if (before === undefined) delete process.env.OTEL_PROFILE;
      else process.env.OTEL_PROFILE = before;
    }
  });
});
