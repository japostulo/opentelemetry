// ── Tracing ─────────────────────────────────────────────────────────────
export type { HaocTelemetryConfig } from './tracing/types';
export { setupTracing } from './tracing/setup';

// ── Profile utilities (admin / testing) ─────────────────────────────────
export {
  resolveProfile,
  getRuntimeProfile,
  _resetRuntimeProfileCache,
} from './tracing/profile';
export type {
  HaocProfileName,
  ResolvedProfile,
  ProfileOverrides,
} from './tracing/profile';

// ── Identity ────────────────────────────────────────────────────────────
export {
  HAOC_USER_ATTR,
  HAOC_USER_ROLE_ATTR,
  HAOC_USER_TYPE_ATTR,
  setUser,
  clearUser,
  getUser,
  getUserSpanAttributes,
  type HaocUserIdentity,
  type HaocUserType,
} from './identity';

// ── Logger ──────────────────────────────────────────────────────────────
export type { LogDestination, LoggerConfig } from './logger/types';
export {
  buildLoggerConfig,
  getLogDestination,
  isOtlpEnabled,
  isConsoleEnabled,
} from './logger/config';
export { GatedLogExporter } from './logger/gated-exporter';
export { DEFAULT_REDACT_PATHS, mergeRedactPaths } from './logger/redaction';

// ── OpenTelemetry API (re-export for convenience) ───────────────────────
export { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';
export type { Span, Tracer, Context } from '@opentelemetry/api';

// ── Utils ───────────────────────────────────────────────────────────────
export { safeStringify, hasContent, tryParseJson } from './utils/stringify';
export {
  DEFAULT_SENSITIVE_FIELDS,
  isSensitive,
  mergeSensitiveFields,
} from './utils/sanitize';
export {
  flattenToSpan,
  flattenToRecord,
  type AttrPrimitive,
  type AttrRecord,
} from './utils/flatten';
