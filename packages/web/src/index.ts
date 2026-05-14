// ── Tracing ─────────────────────────────────────────────────────────────
export {
  initTracing,
  resolveWebProfile,
  matchesAny,
  type OtelWebConfig,
  type OtelWebProfileName,
  type ResolvedWebProfile,
  // deprecated aliases
  type HaocWebConfig,
  type HaocWebProfileName,
} from './tracing';

// ── Page Context ────────────────────────────────────────────────────────
export { setCurrentRoute } from './processor';

// ── Identity ────────────────────────────────────────────────────────────
export {
  USER_ATTR,
  USER_ROLE_ATTR,
  USER_TYPE_ATTR,
  setUser,
  clearUser,
  getUser,
  type UserIdentity,
  type UserType,
  // deprecated aliases
  HAOC_USER_ATTR,
  HAOC_USER_ROLE_ATTR,
  HAOC_USER_TYPE_ATTR,
  type HaocUserIdentity,
  type HaocUserType,
} from './identity';

// ── Browser Detection ───────────────────────────────────────────────────
export {
  detectBrowserInfo,
  type BrowserInfo,
  type DeviceType,
  type AppPlatform,
} from './browser';

// ── Error Tracking ──────────────────────────────────────────────────────
export { installErrorHandlers, createVueErrorHandler } from './errors';
