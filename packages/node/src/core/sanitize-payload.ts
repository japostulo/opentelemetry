/**
 * Unified payload sanitizer for use in logs and span attributes.
 *
 * Provides a single sanitization path that:
 * 1. Strips sensitive fields (password, cpf, token, …) — see DEFAULT_SENSITIVE_FIELDS
 * 2. Preserves the object structure (does NOT flatten into dot-notation)
 * 3. Serializes to a JSON string suitable for haoc.request.json / haoc.response.json
 * 4. Truncates output at a configurable byte limit
 * 5. Detects and discards binary / base64 content
 *
 * Re-exports DEFAULT_SENSITIVE_FIELDS and sanitizeNested for convenience.
 */
import { sanitizeNested, DEFAULT_SENSITIVE_FIELDS } from '../utils/sanitize';

// ── Binary detection ───────────────────────────────────────────────────────

/** Matches `data:<mime>;base64,<data>` data URIs. */
const DATA_URI_PATTERN = /^data:[^;]+;base64,/;

/**
 * Returns true if the string looks like a base64 blob or a data URI.
 *
 * Detection is heuristic — it checks for data URI prefix first, then uses
 * a character-frequency ratio for raw strings longer than 256 characters.
 */
export function isBinaryContent(value: string): boolean {
  if (DATA_URI_PATTERN.test(value)) return true;
  if (value.length < 256) return false;
  const matches = value.match(/[A-Za-z0-9+/=]/g);
  const ratio = (matches?.length ?? 0) / value.length;
  return ratio > 0.92;
}

// ── Options ────────────────────────────────────────────────────────────────

export interface SanitizePayloadOptions {
  /**
   * Custom sensitive fields to redact, merged with {@link DEFAULT_SENSITIVE_FIELDS}.
   */
  sensitiveFields?: Set<string>;

  /**
   * Maximum bytes for the serialized JSON output.
   * Output is suffixed with `...[truncated]` when exceeded.
   * **0 means capture is disabled** — returns null immediately.
   *
   * @default 16384 (16 KB)
   */
  maxBytes?: number;

  /**
   * When true (default), strings that appear to be binary/base64 data are
   * replaced with `'[BINARY_CONTENT]'` instead of being serialized.
   *
   * @default true
   */
  discardBinary?: boolean;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sanitizes a payload and returns a JSON string suitable for use as the
 * value of `haoc.request.json` or `haoc.response.json` OTel attributes.
 *
 * Returns `null` when:
 * - `payload` is null / undefined
 * - `maxBytes` is 0 (capture disabled for this profile)
 * - the resulting JSON is empty (`{}`, `[]`, `"null"`)
 * - serialization fails
 *
 * @param payload  Request or response body to sanitize.
 * @param options  Sanitization options (limits, extra sensitive fields, …).
 */
export function sanitizeToJsonAttr(
  payload: unknown,
  options: SanitizePayloadOptions = {},
): string | null {
  if (payload === null || payload === undefined) return null;

  const maxBytes = options.maxBytes ?? 16 * 1024;
  if (maxBytes === 0) return null;

  // Detect binary strings before any processing
  if (
    options.discardBinary !== false &&
    typeof payload === 'string' &&
    isBinaryContent(payload)
  ) {
    return '[BINARY_CONTENT]';
  }

  const fields = options.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS;
  const sanitized = sanitizeNested(payload, fields);

  let json: string;
  try {
    json = JSON.stringify(sanitized);
  } catch {
    return null;
  }

  // Skip empty / degenerate results
  if (!json || json === '{}' || json === '[]' || json === 'null') return null;

  // Truncate if the serialized payload exceeds the limit
  if (json.length > maxBytes) {
    return json.substring(0, maxBytes) + '...[truncated]';
  }

  return json;
}

// Re-export for convenience
export { DEFAULT_SENSITIVE_FIELDS, sanitizeNested };
