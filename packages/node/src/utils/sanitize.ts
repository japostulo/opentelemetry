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
  // PT-BR / HAOC PII
  'cpf',
  'rg',
  'cnpj',
  'cartao_sus',
  'cns',
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

/**
 * Deep-sanitizes an object, replacing sensitive field values with '[REDACTED]'
 * while preserving the nested structure (unlike flattenToRecord which flattens).
 * Arrays are walked recursively; non-object/array values are returned as-is.
 */
export function sanitizeNested(
  data: unknown,
  sensitiveFields: Set<string> = DEFAULT_SENSITIVE_FIELDS,
  depth = 0,
): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeNested(item, sensitiveFields, depth + 1));
  }
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = isSensitive(key, sensitiveFields)
        ? '[REDACTED]'
        : sanitizeNested(value, sensitiveFields, depth + 1);
    }
    return result;
  }
  return data;
}
