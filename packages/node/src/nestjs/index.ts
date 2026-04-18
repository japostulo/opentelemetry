export {
  HaocTraceInterceptor,
  HAOC_SENSITIVE_FIELDS,
  type TraceInterceptorOptions,
} from './trace.interceptor';
export {
  HaocLoggerModule,
  HAOC_CORS_CONFIG,
  HAOC_CORS_ALLOWED_HEADERS,
  HAOC_CORS_EXPOSED_HEADERS,
  buildLoggerModuleParams,
  type HaocCorsConfig,
} from './logger.module';
export type { HaocModuleConfig } from './types';
export { configureHaocApp, bootstrapHaocApp, type HaocAppOptions, type HaocBootstrapConfig } from './bootstrap';

// Re-export identity for convenience
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
} from '../identity';

// Re-export Logger so consumers don't need nestjs-pino as a direct dependency
export { Logger as PinoLogger } from 'nestjs-pino';
