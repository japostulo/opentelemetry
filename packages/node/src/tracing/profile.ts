/**
 * Profile resolver for HAOC OpenTelemetry (Node).
 *
 * Resolves the effective configuration in this precedence order:
 *   explicit programmatic argument > env var (HAOC_OTEL_*) > profile default
 *
 * Three named profiles:
 *   - `minimal` (default): only essential server-inbound HTTP + DB + errors.
 *     Express middleware spans suppressed; static-asset / health / metrics
 *     paths ignored; request/response body capture is OFF.
 *   - `standard`: same as `minimal` but with body/response capture ON and
 *     a wider sample ratio.
 *   - `verbose`: legacy behaviour — everything on, no path filters.
 */

export type HaocProfileName = 'minimal' | 'standard' | 'verbose';

export type ExpressIgnoreLayer = 'middleware' | 'request_handler' | 'router';

export interface ResolvedProfile {
  profile: HaocProfileName;
  sampleRatio: number;
  ignoreIncomingPaths: RegExp[];
  ignoreOutgoingUrls: RegExp[];
  ignoreRoutes: RegExp[];
  expressIgnoreLayers: ExpressIgnoreLayer[];
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  /** Whether to include the request body in Pino log entries (independent of span attributes). */
  logRequestBody: boolean;
  /** Whether to include the response body in Pino log entries (independent of span attributes). */
  logResponseBody: boolean;
  /** Routes where body/response will NOT be included in log entries (even if logRequestBody/logResponseBody is true). */
  logBodyIgnoreRoutes: RegExp[];
  /** If non-empty, ONLY these routes will have body/response in log entries. Takes precedence over logBodyIgnoreRoutes. */
  logBodyOnlyRoutes: RegExp[];
  instrumentations: {
    fs: boolean;
    net: boolean;
    dns: boolean;
    http: boolean;
    express: boolean;
    nestjs: boolean;
    pg: boolean;
    mysql: boolean;
    mysql2: boolean;
    mongodb: boolean;
    ioredis: boolean;
    redis: boolean;
    pino: boolean;
  };
}

const STATIC_ASSET_REGEX =
  /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map)(\?|$)/i;

const DEFAULT_IGNORE_INCOMING: RegExp[] = [
  /^\/health$/i,
  /^\/healthz$/i,
  /^\/ready$/i,
  /^\/live$/i,
  /^\/metrics$/i,
  /^\/favicon\.ico$/i,
];

const DEFAULT_IGNORE_OUTGOING: RegExp[] = [];

const PROFILES: Record<HaocProfileName, ResolvedProfile> = {
  minimal: {
    profile: 'minimal',
    sampleRatio: 1.0,
    ignoreIncomingPaths: [...DEFAULT_IGNORE_INCOMING, STATIC_ASSET_REGEX],
    ignoreOutgoingUrls: [...DEFAULT_IGNORE_OUTGOING],
    ignoreRoutes: [],
    expressIgnoreLayers: ['middleware', 'router', 'request_handler'],
    captureRequestBody: false,
    captureResponseBody: false,
    logRequestBody: false,
    logResponseBody: false,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    instrumentations: {
      fs: false,
      net: false,
      dns: false,
      http: true,
      express: true,
      nestjs: true,
      pg: true,
      mysql: false,
      mysql2: false,
      mongodb: false,
      ioredis: false,
      redis: false,
      pino: true,
    },
  },
  standard: {
    profile: 'standard',
    sampleRatio: 1.0,
    ignoreIncomingPaths: [...DEFAULT_IGNORE_INCOMING],
    ignoreOutgoingUrls: [],
    ignoreRoutes: [],
    expressIgnoreLayers: ['middleware'],
    captureRequestBody: true,
    captureResponseBody: true,
    logRequestBody: true,
    logResponseBody: true,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    instrumentations: {
      fs: false,
      net: false,
      dns: false,
      http: true,
      express: true,
      nestjs: true,
      pg: true,
      mysql: true,
      mysql2: true,
      mongodb: true,
      ioredis: true,
      redis: true,
      pino: true,
    },
  },
  verbose: {
    profile: 'verbose',
    sampleRatio: 1.0,
    ignoreIncomingPaths: [],
    ignoreOutgoingUrls: [],
    ignoreRoutes: [],
    expressIgnoreLayers: [],
    captureRequestBody: true,
    captureResponseBody: true,
    logRequestBody: true,
    logResponseBody: true,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    instrumentations: {
      fs: true,
      net: true,
      dns: true,
      http: true,
      express: true,
      nestjs: true,
      pg: true,
      mysql: true,
      mysql2: true,
      mongodb: true,
      ioredis: true,
      redis: true,
      pino: true,
    },
  },
};

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
}

function parseRatio(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return undefined;
}

/**
 * Parses a CSV of regex patterns. Each segment is compiled with case-
 * insensitive flag. Invalid patterns are skipped silently.
 */
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
      // skip invalid
    }
  }
  return out;
}

export interface ProfileOverrides {
  profile?: HaocProfileName;
  sampleRatio?: number;
  ignoreIncomingPaths?: (string | RegExp)[];
  ignoreOutgoingUrls?: (string | RegExp)[];
  ignoreRoutes?: (string | RegExp)[];
  expressIgnoreLayers?: ExpressIgnoreLayer[];
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
  /** Whether to include the request body in Pino log entries (independent of span capture). */
  logRequestBody?: boolean;
  /** Whether to include the response body in Pino log entries (independent of span capture). */
  logResponseBody?: boolean;
  /** Routes where body/response logging is suppressed. CSV regex via `HAOC_OTEL_LOG_BODY_IGNORE_ROUTES`. */
  logBodyIgnoreRoutes?: (string | RegExp)[];
  /** If set, only these routes get body/response in logs. CSV regex via `HAOC_OTEL_LOG_BODY_ONLY_ROUTES`. */
  logBodyOnlyRoutes?: (string | RegExp)[];
  instrumentations?: Partial<ResolvedProfile['instrumentations']>;
  /**
   * If true, do not read HAOC_OTEL_* env vars (programmatic only).
   * Useful for tests.
   */
  ignoreEnv?: boolean;
}

/**
 * Resolves the active profile + overrides + env vars into a single
 * {@link ResolvedProfile}. Programmatic args win over env, env wins over
 * the named profile defaults.
 */
export function resolveProfile(overrides: ProfileOverrides = {}): ResolvedProfile {
  const useEnv = !overrides.ignoreEnv;
  const env = useEnv ? process.env : ({} as NodeJS.ProcessEnv);

  const profileName: HaocProfileName =
    overrides.profile ??
    (env.HAOC_OTEL_PROFILE as HaocProfileName | undefined) ??
    'minimal';

  const base = PROFILES[profileName] ?? PROFILES.minimal;

  // Sample ratio: explicit > env > profile default. In production fall back
  // to a more aggressive default if the profile says 1.0 and no env is set.
  const explicitRatio =
    overrides.sampleRatio ?? parseRatio(env.HAOC_OTEL_SAMPLE_RATIO);
  let sampleRatio = explicitRatio ?? base.sampleRatio;
  if (
    explicitRatio === undefined &&
    profileName !== 'verbose' &&
    (env.NODE_ENV === 'production' || env.APP_ENV === 'production') &&
    base.sampleRatio === 1.0
  ) {
    sampleRatio = 0.2;
  }

  const ignoreIncomingPaths = [
    ...base.ignoreIncomingPaths,
    ...parsePatternList(env.HAOC_OTEL_IGNORE_URLS),
    ...parsePatternList(overrides.ignoreIncomingPaths),
  ];

  const ignoreOutgoingUrls = [
    ...base.ignoreOutgoingUrls,
    ...parsePatternList(env.HAOC_OTEL_IGNORE_OUTGOING_URLS),
    ...parsePatternList(overrides.ignoreOutgoingUrls),
  ];

  const ignoreRoutes = [
    ...base.ignoreRoutes,
    ...parsePatternList(env.HAOC_OTEL_IGNORE_ROUTES),
    ...parsePatternList(overrides.ignoreRoutes),
  ];

  const expressIgnoreLayers: ExpressIgnoreLayer[] =
    overrides.expressIgnoreLayers ??
    (env.HAOC_OTEL_EXPRESS_IGNORE_LAYERS
      ? (env.HAOC_OTEL_EXPRESS_IGNORE_LAYERS.split(',')
          .map((s) => s.trim())
          .filter(Boolean) as ExpressIgnoreLayer[])
      : base.expressIgnoreLayers);

  const captureRequestBody =
    overrides.captureRequestBody ??
    parseBool(env.HAOC_OTEL_CAPTURE_BODY) ??
    base.captureRequestBody;

  const captureResponseBody =
    overrides.captureResponseBody ??
    parseBool(env.HAOC_OTEL_CAPTURE_RESPONSE) ??
    base.captureResponseBody;

  // ── Log body controls (independent of span capture) ─────────────────
  const logRequestBody =
    overrides.logRequestBody ??
    parseBool(env.HAOC_OTEL_LOG_REQUEST_BODY) ??
    base.logRequestBody;

  const logResponseBody =
    overrides.logResponseBody ??
    parseBool(env.HAOC_OTEL_LOG_RESPONSE_BODY) ??
    base.logResponseBody;

  const logBodyIgnoreRoutes = [
    ...base.logBodyIgnoreRoutes,
    ...parsePatternList(env.HAOC_OTEL_LOG_BODY_IGNORE_ROUTES),
    ...parsePatternList(overrides.logBodyIgnoreRoutes),
  ];

  const logBodyOnlyRoutes = [
    ...base.logBodyOnlyRoutes,
    ...parsePatternList(env.HAOC_OTEL_LOG_BODY_ONLY_ROUTES),
    ...parsePatternList(overrides.logBodyOnlyRoutes),
  ];

  // Per-instrumentation toggles via env: HAOC_OTEL_TRACE_<NAME>=true|false
  const envInstr: Partial<ResolvedProfile['instrumentations']> = {
    http: parseBool(env.HAOC_OTEL_TRACE_HTTP),
    express: parseBool(env.HAOC_OTEL_TRACE_EXPRESS),
    nestjs: parseBool(env.HAOC_OTEL_TRACE_NESTJS),
    pg: parseBool(env.HAOC_OTEL_TRACE_PG),
    mysql: parseBool(env.HAOC_OTEL_TRACE_MYSQL),
    mysql2: parseBool(env.HAOC_OTEL_TRACE_MYSQL2),
    mongodb: parseBool(env.HAOC_OTEL_TRACE_MONGODB),
    ioredis: parseBool(env.HAOC_OTEL_TRACE_IOREDIS),
    redis: parseBool(env.HAOC_OTEL_TRACE_REDIS),
    pino: parseBool(env.HAOC_OTEL_TRACE_PINO),
    fs: parseBool(env.HAOC_OTEL_TRACE_FS),
    net: parseBool(env.HAOC_OTEL_TRACE_NET),
    dns: parseBool(env.HAOC_OTEL_TRACE_DNS),
  } as Partial<ResolvedProfile['instrumentations']>;

  // Strip undefined entries so they don't override base/explicit values.
  for (const k of Object.keys(envInstr) as (keyof typeof envInstr)[]) {
    if (envInstr[k] === undefined) delete envInstr[k];
  }

  const instrumentations: ResolvedProfile['instrumentations'] = {
    ...base.instrumentations,
    ...envInstr,
    ...(overrides.instrumentations ?? {}),
  };

  return {
    profile: profileName,
    sampleRatio,
    ignoreIncomingPaths,
    ignoreOutgoingUrls,
    ignoreRoutes,
    expressIgnoreLayers,
    captureRequestBody,
    captureResponseBody,
    logRequestBody,
    logResponseBody,
    logBodyIgnoreRoutes,
    logBodyOnlyRoutes,
    instrumentations,
  };
}

/**
 * Returns true if any of the patterns matches the given value.
 */
export function matchesAny(patterns: RegExp[], value: string): boolean {
  for (const p of patterns) {
    if (p.test(value)) return true;
  }
  return false;
}

// ── Runtime helpers (consumed by interceptor / middleware) ─────────────

interface RuntimeProfileSummary {
  profile: HaocProfileName;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  ignoreRoutes: RegExp[];
  logBodyIgnoreRoutes: RegExp[];
  logBodyOnlyRoutes: RegExp[];
}

let _runtimeCache: RuntimeProfileSummary | null = null;

/**
 * Reads the resolved profile that {@link resolveProfile} stored in
 * `process.env.HAOC_OTEL_RESOLVED_PROFILE` during `setupTracing()`.
 * Falls back to the default `minimal` profile if `setupTracing` was not
 * called (e.g. in unit tests).
 */
export function getRuntimeProfile(): RuntimeProfileSummary {
  if (_runtimeCache) return _runtimeCache;
  const raw = process.env.HAOC_OTEL_RESOLVED_PROFILE;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        profile: HaocProfileName;
        captureRequestBody: boolean;
        captureResponseBody: boolean;
        logRequestBody: boolean;
        logResponseBody: boolean;
        ignoreRoutes: string[];
        logBodyIgnoreRoutes: string[];
        logBodyOnlyRoutes: string[];
      };
      _runtimeCache = {
        profile: parsed.profile,
        captureRequestBody: parsed.captureRequestBody,
        captureResponseBody: parsed.captureResponseBody,
        logRequestBody: parsed.logRequestBody ?? true,
        logResponseBody: parsed.logResponseBody ?? true,
        ignoreRoutes: (parsed.ignoreRoutes ?? []).map(
          (s) => new RegExp(s, 'i'),
        ),
        logBodyIgnoreRoutes: (parsed.logBodyIgnoreRoutes ?? []).map(
          (s) => new RegExp(s, 'i'),
        ),
        logBodyOnlyRoutes: (parsed.logBodyOnlyRoutes ?? []).map(
          (s) => new RegExp(s, 'i'),
        ),
      };
      return _runtimeCache;
    } catch {
      // fallthrough to default
    }
  }
  const defaults = PROFILES.minimal;
  _runtimeCache = {
    profile: defaults.profile,
    captureRequestBody: defaults.captureRequestBody,
    captureResponseBody: defaults.captureResponseBody,
    logRequestBody: defaults.logRequestBody,
    logResponseBody: defaults.logResponseBody,
    ignoreRoutes: [...defaults.ignoreRoutes],
    logBodyIgnoreRoutes: [...defaults.logBodyIgnoreRoutes],
    logBodyOnlyRoutes: [...defaults.logBodyOnlyRoutes],
  };
  return _runtimeCache;
}

/**
 * Determines whether body/response should be included in log entries for a given route.
 *
 * Priority:
 * 1. If `logBodyOnlyRoutes` is non-empty → only matching routes get body in logs.
 * 2. Otherwise, if `logBodyIgnoreRoutes` matches → body is suppressed.
 * 3. Otherwise → body is included.
 */
export function shouldLogBodyForRoute(
  runtime: RuntimeProfileSummary,
  route: string,
): boolean {
  if (runtime.logBodyOnlyRoutes.length > 0) {
    return matchesAny(runtime.logBodyOnlyRoutes, route);
  }
  if (runtime.logBodyIgnoreRoutes.length > 0) {
    return !matchesAny(runtime.logBodyIgnoreRoutes, route);
  }
  return true;
}

/**
 * Test-only: clears the cached runtime profile so the next call re-reads
 * `process.env.HAOC_OTEL_RESOLVED_PROFILE`.
 */
export function _resetRuntimeProfileCache(): void {
  _runtimeCache = null;
}
