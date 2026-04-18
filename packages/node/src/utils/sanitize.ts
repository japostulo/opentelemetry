/**
 * Default set of field names considered sensitive.
 * Used by both span-attribute flattening and pino log flattening.
 */
export const DEFAULT_SENSITIVE_FIELDS = new Set([
  'password',
  'senha',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'db_password',
  'network_password',
  'tasy_password',
]);

/**
 * Returns true if the given field name (case-insensitive) is in the
 * sensitive-fields set.
 *
 * @param fieldName  The field name to check.
 * @param sensitiveFields  Optional custom set to check against. Defaults to
 *                         {@link DEFAULT_SENSITIVE_FIELDS}.
 */
export function isSensitive(
  fieldName: string,
  sensitiveFields: Set<string> = DEFAULT_SENSITIVE_FIELDS,
): boolean {
  return sensitiveFields.has(fieldName.toLowerCase());
}

/**
 * Merges a user-supplied iterable of sensitive-field names with the defaults.
 */
export function mergeSensitiveFields(
  extra?: Iterable<string>,
): Set<string> {
  const merged = new Set(DEFAULT_SENSITIVE_FIELDS);
  if (extra) {
    for (const f of extra) merged.add(f.toLowerCase());
  }
  return merged;
}
