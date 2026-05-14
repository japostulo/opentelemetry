/**
 * Profile resolver for OpenTelemetry (Web).
 *
 * Three named profiles:
 *   - `minimal` (default): only fetch/XHR to whitelisted API URLs + errors.
 *     Document-load instrumentation OFF; static assets ignored.
 *   - `standard`: everything in minimal + document-load instrumentation.
 *   - `verbose`: legacy "everything on" behaviour.
 */

export type OtelWebProfileName = 'minimal' | 'standard' | 'verbose';
/** @deprecated Use {@link OtelWebProfileName} */
export type HaocWebProfileName = OtelWebProfileName;

export interface ResolvedWebProfile {
  profile: OtelWebProfileName;
  sampleRatio: number;
  ignoreUrls: RegExp[];
  ignoreErrorMessages: RegExp[];
  enableDocumentLoad: boolean;
  enableErrorTracking: boolean;
  /**
   * If true, only fetch/XHR calls whose URL matches `apiUrls` will produce
   * spans (apiUrls acts as a whitelist). When false, all fetch/XHR calls
   * produce spans (apiUrls only governs CORS header propagation).
   */
  apiUrlsAsWhitelist: boolean;
}

const STATIC_ASSET_REGEX =
  /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map)(\?|$)/i;

const DEFAULT_IGNORE_ERRORS: RegExp[] = [
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
];

const PROFILES: Record<OtelWebProfileName, ResolvedWebProfile> = {
  minimal: {
    profile: 'minimal',
    sampleRatio: 1.0,
    ignoreUrls: [STATIC_ASSET_REGEX],
    ignoreErrorMessages: [...DEFAULT_IGNORE_ERRORS],
    enableDocumentLoad: false,
    enableErrorTracking: true,
    apiUrlsAsWhitelist: true,
  },
  standard: {
    profile: 'standard',
    sampleRatio: 1.0,
    ignoreUrls: [STATIC_ASSET_REGEX],
    ignoreErrorMessages: [...DEFAULT_IGNORE_ERRORS],
    enableDocumentLoad: true,
    enableErrorTracking: true,
    apiUrlsAsWhitelist: false,
  },
  verbose: {
    profile: 'verbose',
    sampleRatio: 1.0,
    ignoreUrls: [],
    ignoreErrorMessages: [],
    enableDocumentLoad: true,
    enableErrorTracking: true,
    apiUrlsAsWhitelist: false,
  },
};

function parseRatio(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return undefined;
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
}

export function parsePatternList(
  value: string | (string | RegExp)[] | undefined,
): RegExp[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const out: RegExp[] = [];
  for (const item of items) {
    if (item instanceof RegExp) {
      out.push(item);
      continue;
    }
    try {
      out.push(new RegExp(item, 'i'));
    } catch {
      // skip
    }
  }
  return out;
}

export interface WebProfileOverrides {
  profile?: OtelWebProfileName;
  sampleRatio?: number;
  ignoreUrls?: (string | RegExp)[];
  ignoreErrorMessages?: (string | RegExp)[];
  enableDocumentLoad?: boolean;
  enableErrorTracking?: boolean;
  apiUrlsAsWhitelist?: boolean;
  /**
   * Map of `import.meta.env` (Vite) or `process.env` style values. Allows
   * the consumer to inject the framework-specific env source. When omitted,
   * we try `globalThis.process?.env` and skip env-based overrides if not
   * available.
   */
  env?: Record<string, string | undefined>;
}

function pickEnv(
  envMap: Record<string, string | undefined> | undefined,
  ...keys: string[]
): string | undefined {
  if (!envMap) return undefined;
  for (const k of keys) {
    const v = envMap[k];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

export function resolveWebProfile(
  overrides: WebProfileOverrides = {},
): ResolvedWebProfile {
  const env =
    overrides.env ??
    ((globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env as Record<string, string | undefined> | undefined);

  const profileName: OtelWebProfileName =
    overrides.profile ??
    ((pickEnv(env, 'OTEL_PROFILE', 'VITE_OTEL_PROFILE') as
      | OtelWebProfileName
      | undefined) ??
      'minimal');

  const base = PROFILES[profileName] ?? PROFILES.minimal;

  const sampleRatio =
    overrides.sampleRatio ??
    parseRatio(
      pickEnv(env, 'OTEL_SAMPLE_RATIO', 'VITE_OTEL_SAMPLE_RATIO'),
    ) ??
    base.sampleRatio;

  const ignoreUrls = [
    ...base.ignoreUrls,
    ...parsePatternList(
      pickEnv(env, 'OTEL_IGNORE_URLS', 'VITE_OTEL_IGNORE_URLS'),
    ),
    ...parsePatternList(overrides.ignoreUrls),
  ];

  const ignoreErrorMessages = [
    ...base.ignoreErrorMessages,
    ...parsePatternList(
      pickEnv(env, 'OTEL_IGNORE_ERRORS', 'VITE_OTEL_IGNORE_ERRORS'),
    ),
    ...parsePatternList(overrides.ignoreErrorMessages),
  ];

  const enableDocumentLoad =
    overrides.enableDocumentLoad ??
    parseBool(
      pickEnv(env, 'OTEL_DOCUMENT_LOAD', 'VITE_OTEL_DOCUMENT_LOAD'),
    ) ??
    base.enableDocumentLoad;

  const enableErrorTracking =
    overrides.enableErrorTracking ??
    parseBool(
      pickEnv(env, 'OTEL_ERROR_TRACKING', 'VITE_OTEL_ERROR_TRACKING'),
    ) ??
    base.enableErrorTracking;

  const apiUrlsAsWhitelist =
    overrides.apiUrlsAsWhitelist ??
    parseBool(
      pickEnv(
        env,
        'OTEL_API_WHITELIST',
        'VITE_OTEL_API_WHITELIST',
      ),
    ) ??
    base.apiUrlsAsWhitelist;

  return {
    profile: profileName,
    sampleRatio,
    ignoreUrls,
    ignoreErrorMessages,
    enableDocumentLoad,
    enableErrorTracking,
    apiUrlsAsWhitelist,
  };
}

export function matchesAny(patterns: RegExp[], value: string): boolean {
  for (const p of patterns) {
    if (p.test(value)) return true;
  }
  return false;
}
