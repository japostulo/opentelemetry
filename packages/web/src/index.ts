// ── Tracing ─────────────────────────────────────────────────────────────
export {
  initTracing,
  resolveWebProfile,
  matchesAny,
  type HaocWebConfig,
  type HaocWebProfileName,
  type ResolvedWebProfile,
} from './tracing';

// ── Page Context ────────────────────────────────────────────────────────
export { setCurrentRoute } from './processor';

// ── Identity ────────────────────────────────────────────────────────────
export {
  HAOC_USER_ATTR,
  HAOC_USER_ROLE_ATTR,
  HAOC_USER_TYPE_ATTR,
  setUser,
  clearUser,
  getUser,
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
