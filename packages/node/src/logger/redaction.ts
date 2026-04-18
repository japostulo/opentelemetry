/**
 * Default pino redact paths — secondary protection layer.
 *
 * The trace interceptor / middleware already redacts sensitive fields from
 * HTTP attributes via flattenToRecord(). These paths cover any *other*
 * logger.info({…}) calls that might pass nested objects directly.
 */
export const DEFAULT_REDACT_PATHS: string[] = [
  // Top-level keys (e.g. logger.info({ password: '...' }))
  'password',
  'senha',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',

  // Nested patterns from application / service code
  'user.password',
  'user.senha',
  'user.token',
  'user.access_token',
  'user.refresh_token',
  'user.secret',
  'user.authorization',

  'auth.token',
  'auth.access_token',
  'auth.refresh_token',
  'auth.secret',
  'auth.authorization',

  'data.password',
  'data.senha',
  'data.token',
  'data.secret',
  'data.access_token',
  'data.refresh_token',

  'body.password',
  'body.senha',
  'body.token',
  'body.access_token',
  'body.refresh_token',
  'body.authorization',
  'body.secret',

  'credentials.password',
  'credentials.token',
  'credentials.secret',

  // HTTP request / response headers
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'err.config.headers.Authorization',
];

/**
 * Merges user-supplied paths with the defaults, deduplicating.
 */
export function mergeRedactPaths(extra?: string[]): string[] {
  if (!extra || extra.length === 0) return DEFAULT_REDACT_PATHS;
  return [...new Set([...DEFAULT_REDACT_PATHS, ...extra])];
}
