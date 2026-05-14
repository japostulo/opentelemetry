// ── Primary exports ────────────────────────────────────────────────────────
export {
  OtelInterceptor,
  OTEL_SENSITIVE_FIELDS,
  // deprecated aliases
  HaocTraceInterceptor,
  HAOC_SENSITIVE_FIELDS,
  type TraceInterceptorOptions,
} from './trace.interceptor';
export {
  OtelModule,
  OTEL_CORS_CONFIG,
  OTEL_CORS_ALLOWED_HEADERS,
  OTEL_CORS_EXPOSED_HEADERS,
  buildLoggerModuleParams,
  type CorsConfig,
  // deprecated aliases
  HaocLoggerModule,
  HAOC_CORS_CONFIG,
  HAOC_CORS_ALLOWED_HEADERS,
  HAOC_CORS_EXPOSED_HEADERS,
  type HaocCorsConfig,
} from './logger.module';
export type { OtelModuleConfig, HaocModuleConfig } from './types';
export {
  configureApp,
  bootstrapHaocApp,
  type AppOptions,
  type HaocAppOptions,
  type HaocBootstrapConfig,
  // deprecated alias
  configureHaocApp,
} from './bootstrap';

// ── Identity re-exports ────────────────────────────────────────────────────
export {
  USER_ATTR,
  USER_ROLE_ATTR,
  USER_TYPE_ATTR,
  setUser,
  clearUser,
  getUser,
  getUserSpanAttributes,
  type UserIdentity,
  type UserType,
  // deprecated aliases
  HAOC_USER_ATTR,
  HAOC_USER_ROLE_ATTR,
  HAOC_USER_TYPE_ATTR,
  type HaocUserIdentity,
  type HaocUserType,
} from '../identity';

// ── Pino re-export ─────────────────────────────────────────────────────────
// Re-export Logger so consumers don't need nestjs-pino as a direct dependency
export { Logger as PinoLogger } from 'nestjs-pino';
