const MAX_BODY_SIZE = 10 * 1024; // 10KB

/**
 * Safe JSON.stringify with size limit and truncation.
 */
export function safeStringify(obj: unknown): string {
  try {
    if (typeof obj !== 'object' || obj === null) return String(obj);
    const str = JSON.stringify(obj);
    return str && str.length > MAX_BODY_SIZE
      ? str.substring(0, MAX_BODY_SIZE) + '...[truncated]'
      : str;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Returns true if the value is a non-null object with at least one key.
 */
export function hasContent(obj: unknown): boolean {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    Object.keys(obj as object).length > 0
  );
}

/**
 * Tries to parse a string as JSON. Returns the parsed value if it is a
 * plain object or array, otherwise returns undefined.
 */
export function tryParseJson(
  value: string,
): object | unknown[] | undefined {
  const trimmed = value.trimStart();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object')
      return parsed as object | unknown[];
  } catch {
    // not valid JSON — treat as plain string
  }
  return undefined;
}
