import type { Span } from '@opentelemetry/api';
import { safeStringify, tryParseJson } from './stringify';
import { DEFAULT_SENSITIVE_FIELDS } from './sanitize';

const MAX_BODY_SIZE = 10 * 1024; // 10KB
const MAX_FLATTEN_DEPTH = 4;

/** Primitive types that OTel / pino natively support (no coercion needed). */
export type AttrPrimitive = string | number | boolean;
export type AttrRecord = Record<string, AttrPrimitive>;

/**
 * Flattens a plain object into OpenTelemetry span attributes using dot notation.
 * Preserves number and boolean types. String values that are valid JSON
 * objects/arrays are recursively expanded.
 *
 * @param span              The active OTel span.
 * @param prefix            Dot-notation prefix (e.g. "body", "query").
 * @param obj               The value to flatten.
 * @param depth             Current recursion depth (max {@link MAX_FLATTEN_DEPTH}).
 * @param sensitiveFields   Set of lower-cased field names to redact.
 */
export function flattenToSpan(
  span: Span,
  prefix: string,
  obj: unknown,
  depth = 0,
  sensitiveFields: Set<string> = DEFAULT_SENSITIVE_FIELDS,
): void {
  if (depth > MAX_FLATTEN_DEPTH || obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    span.setAttribute(prefix, safeStringify(obj));
    return;
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      span.setAttribute(prefix, obj);
    } else {
      const str = String(obj);
      span.setAttribute(
        prefix,
        str.length > MAX_BODY_SIZE
          ? str.substring(0, MAX_BODY_SIZE) + '...[truncated]'
          : str,
      );
    }
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const attrKey = `${prefix}.${key}`;

    if (sensitiveFields.has(key.toLowerCase())) {
      span.setAttribute(attrKey, '[REDACTED]');
      continue;
    }

    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      span.setAttribute(attrKey, safeStringify(value));
    } else if (typeof value === 'object') {
      flattenToSpan(span, attrKey, value, depth + 1, sensitiveFields);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      span.setAttribute(attrKey, value);
    } else if (typeof value === 'string') {
      const parsed = tryParseJson(value);
      if (parsed !== undefined) {
        flattenToSpan(span, attrKey, parsed, depth + 1, sensitiveFields);
      } else {
        span.setAttribute(attrKey, value);
      }
    } else {
      span.setAttribute(attrKey, String(value));
    }
  }
}

/**
 * Flattens a plain object into a pino log attribute record using dot notation.
 * Preserves number and boolean types so OTel stores them in the correct
 * ClickHouse column (attributes_number / attributes_bool / attributes_string).
 *
 * @param record            The mutable record to populate.
 * @param prefix            Dot-notation prefix.
 * @param obj               The value to flatten.
 * @param depth             Current recursion depth.
 * @param sensitiveFields   Set of lower-cased field names to redact.
 */
export function flattenToRecord(
  record: AttrRecord,
  prefix: string,
  obj: unknown,
  depth = 0,
  sensitiveFields: Set<string> = DEFAULT_SENSITIVE_FIELDS,
): void {
  if (depth > MAX_FLATTEN_DEPTH || obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    record[prefix] = safeStringify(obj);
    return;
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      record[prefix] = obj;
    } else {
      const str = String(obj);
      record[prefix] =
        str.length > MAX_BODY_SIZE
          ? str.substring(0, MAX_BODY_SIZE) + '...[truncated]'
          : str;
    }
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const attrKey = `${prefix}.${key}`;

    if (sensitiveFields.has(key.toLowerCase())) {
      record[attrKey] = '[REDACTED]';
      continue;
    }

    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      record[attrKey] = safeStringify(value);
    } else if (typeof value === 'object') {
      flattenToRecord(record, attrKey, value, depth + 1, sensitiveFields);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      record[attrKey] = value;
    } else if (typeof value === 'string') {
      const parsed = tryParseJson(value);
      if (parsed !== undefined) {
        flattenToRecord(record, attrKey, parsed, depth + 1, sensitiveFields);
      } else {
        record[attrKey] = value;
      }
    } else {
      record[attrKey] = String(value);
    }
  }
}
