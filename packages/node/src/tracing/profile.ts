/**
 * Profile resolver for Node OpenTelemetry.
 *
 * Resolves the effective configuration in this precedence order:
 *   explicit programmatic argument > env var (OTEL_*) > profile default
 *
 * Three named profiles:
 *   - `minimal` (default): only essential server-inbound HTTP + DB + errors.
 *     Express middleware spans suppressed; static-asset / health / metrics
 *     paths ignored; request/response body capture is OFF.
 *   - `standard`: basic tracing without span body flatten; payload goes into
 *     logs as a single `request.json` / `response.json` attribute.
 *   - `verbose`: everything on — span body flatten, full log payload, OPTIONS logging.
 */
import type { PayloadMode } from '../core/observability-profile';

export type OtelProfileName = 'minimal' | 'standard' | 'verbose';
/** @deprecated Use {@link OtelProfileName} */
export type HaocProfileName = OtelProfileName;

export type ExpressIgnoreLayer = 'middleware' | 'request_handler' | 'router';

export interface ResolvedProfile {
  profile: OtelProfileName;
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
  /**
   * How payload is stored in log attributes.
   * - `none`:      no payload in logs (minimal)
   * - `json-attr`: single `request.json` / `response.json` attribute (standard, verbose)
   * - `flatten`:   legacy dot-notation attributes (backward compat)
   *
   * Overridable via `OTEL_LOG_PAYLOAD_MODE` env var.
   */
  logPayloadMode: PayloadMode;
  /** Routes where body/response will NOT be included in log entries (even if logRequestBody/logResponseBody is true). */
  logBodyIgnoreRoutes: RegExp[];
  /** If non-empty, ONLY these routes will have body/response in log entries. Takes precedence over logBodyIgnoreRoutes. */
  logBodyOnlyRoutes: RegExp[];
  /**
   * When true, incoming OPTIONS (CORS preflight) requests are silently
   * dropped — no span is created, no log emitted.
   * Enabled for `minimal` and `standard`; disabled for `verbose`.
   */
  ignoreOptions: boolean;
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

const PROFILES: Record<OtelProfileName, ResolvedProfile> = {
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
    logPayloadMode: 'none' as PayloadMode,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    ignoreOptions: true,
    instrumentations: {
      fs: false,
      net: false,
      dns: false,
      http: true,
      express: true,
      nestjs: false,
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
    // Drop middleware, router and request_handler spans — same as minimal.
    // These layer spans add noise without actionable value in standard traces.
    // Only nestjs.handler and HTTP server/client spans are kept.
    expressIgnoreLayers: ['middleware', 'router', 'request_handler'],
    // Flatten body into span attrs so the trace is self-contained.
    captureRequestBody: true,
    captureResponseBody: true,
    logRequestBody: true,
    logResponseBody: true,
    logPayloadMode: 'json-attr' as PayloadMode,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    ignoreOptions: true,
    instrumentations: {
      fs: false,
      net: false,
      dns: false,
      http: true,
      express: true,
      nestjs: false,
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
    logPayloadMode: 'json-attr' as PayloadMode,
    logBodyIgnoreRoutes: [],
    logBodyOnlyRoutes: [],
    ignoreOptions: false,
    instrumentations: {
      fs: true,
      net: true,
      dns: true,
      http: true,
      express: true,
      nestjs: false,
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
  profile?: OtelProfileName;
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
  /** Routes where body/response logging is suppressed. CSV regex via `OTEL_LOG_BODY_IGNORE_ROUTES`. */
  logBodyIgnoreRoutes?: (string | RegExp)[];
  /** If set, only these routes get body/response in logs. CSV regex via `OTEL_LOG_BODY_ONLY_ROUTES`. */
  logBodyOnlyRoutes?: (string | RegExp)[];
  /**
   * Override the log payload mode for this service.
   * Env var: `OTEL_LOG_PAYLOAD_MODE=none|json-attr|flatten`.
   */
  logPayloadMode?: PayloadMode;
  instrumentations?: Partial<ResolvedProfile['instrumentations']>;
  /**
   * If true, do not read OTEL_* env vars (programmatic only).
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

  const profileName: OtelProfileName =
    overrides.profile ??
    (env.OTEL_PROFILE as OtelProfileName | undefined) ??
    'minimal';

  const base = PROFILES[profileName] ?? PROFILES.minimal;

  // Sample ratio: explicit > env > profile default. In production fall back
  // to a more aggressive default if the profile says 1.0 and no env is set.
  const explicitRatio =
    overrides.sampleRatio ?? parseRatio(env.OTEL_SAMPLE_RATIO);
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
    ...parsePatternList(env.OTEL_IGNORE_URLS),
    ...parsePatternList(overrides.ignoreIncomingPaths),
  ];

  const ignoreOutgoingUrls = [
    ...base.ignoreOutgoingUrls,
    ...parsePatternList(env.OTEL_IGNORE_OUTGOING_URLS),
    ...parsePatternList(overrides.ignoreOutgoingUrls),
  ];

  const ignoreRoutes = [
    ...base.ignoreRoutes,
    ...parsePatternList(env.OTEL_IGNORE_ROUTES),
    ...parsePatternList(overrides.ignoreRoutes),
  ];

  const expressIgnoreLayers: ExpressIgnoreLayer[] =
    overrides.expressIgnoreLayers ??
    (env.OTEL_EXPRESS_IGNORE_LAYERS
      ? (env.OTEL_EXPRESS_IGNORE_LAYERS.split(',')
          .map((s) => s.trim())
          .filter(Boolean) as ExpressIgnoreLayer[])
      : base.expressIgnoreLayers);

  const captureRequestBody =
    overrides.captureRequestBody ??
    parseBool(env.OTEL_CAPTURE_BODY) ??
    base.captureRequestBody;

  const captureResponseBody =
    overrides.captureResponseBody ??
    parseBool(env.OTEL_CAPTURE_RESPONSE) ??
    base.captureResponseBody;

  // ── Log body controls (independent of span capture) ─────────────────
  const logRequestBody =
    overrides.logRequestBody ??
    parseBool(env.OTEL_LOG_REQUEST_BODY) ??
    base.logRequestBody;

  const logResponseBody =
    overrides.logResponseBody ??
    parseBool(env.OTEL_LOG_RESPONSE_BODY) ??
    base.logResponseBody;

  const logBodyIgnoreRoutes = [
    ...base.logBodyIgnoreRoutes,
    ...parsePatternList(env.OTEL_LOG_BODY_IGNORE_ROUTES),
    ...parsePatternList(overrides.logBodyIgnoreRoutes),
  ];

  const logBodyOnlyRoutes = [
    ...base.logBodyOnlyRoutes,
    ...parsePatternList(env.OTEL_LOG_BODY_ONLY_ROUTES),
    ...parsePatternList(overrides.logBodyOnlyRoutes),
  ];

  // Log payload mode: explicit override > env var > profile default
  const envPayloadMode = env.OTEL_LOG_PAYLOAD_MODE as PayloadMode | undefined;
  const validModes: PayloadMode[] = ['none', 'json-attr', 'flatten'];
  const logPayloadMode: PayloadMode =
    overrides.logPayloadMode ??
    (validModes.includes(envPayloadMode as PayloadMode) ? envPayloadMode! : undefined) ??
    base.logPayloadMode;

  // Per-instrumentation toggles via env: OTEL_TRACE_<NAME>=true|false
  const envInstr: Partial<ResolvedProfile['instrumentations']> = {
    http: parseBool(env.OTEL_TRACE_HTTP),
    express: parseBool(env.OTEL_TRACE_EXPRESS),
    nestjs: parseBool(env.OTEL_TRACE_NESTJS),
    pg: parseBool(env.OTEL_TRACE_PG),
    mysql: parseBool(env.OTEL_TRACE_MYSQL),
    mysql2: parseBool(env.OTEL_TRACE_MYSQL2),
    mongodb: parseBool(env.OTEL_TRACE_MONGODB),
    ioredis: parseBool(env.OTEL_TRACE_IOREDIS),
    redis: parseBool(env.OTEL_TRACE_REDIS),
    pino: parseBool(env.OTEL_TRACE_PINO),
    fs: parseBool(env.OTEL_TRACE_FS),
    net: parseBool(env.OTEL_TRACE_NET),
    dns: parseBool(env.OTEL_TRACE_DNS),
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
    logPayloadMode,
    logBodyIgnoreRoutes,
    logBodyOnlyRoutes,
    ignoreOptions: base.ignoreOptions,
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
  profile: OtelProfileName;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  logPayloadMode: PayloadMode;
  ignoreRoutes: RegExp[];
  logBodyIgnoreRoutes: RegExp[];
  logBodyOnlyRoutes: RegExp[];
}

let _runtimeCache: RuntimeProfileSummary | null = null;

/**
 * Reads the resolved profile that {@link resolveProfile} stored in
 * `process.env.OTEL_RESOLVED_PROFILE` during `setupTracing()`.
 * Falls back to the default `minimal` profile if `setupTracing` was not
 * called (e.g. in unit tests).
 */
export function getRuntimeProfile(): RuntimeProfileSummary {
  if (_runtimeCache) return _runtimeCache;
  const raw = process.env.OTEL_RESOLVED_PROFILE;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        profile: OtelProfileName;
        captureRequestBody: boolean;
        captureResponseBody: boolean;
        logRequestBody: boolean;
        logResponseBody: boolean;
        logPayloadMode?: PayloadMode;
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
        logPayloadMode: parsed.logPayloadMode ?? 'none',
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
    logPayloadMode: defaults.logPayloadMode,
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
 * `process.env.OTEL_RESOLVED_PROFILE`.
 */
export function _resetRuntimeProfileCache(): void {
  _runtimeCache = null;
}
