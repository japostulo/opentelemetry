import { describe, it, expect } from 'vitest';
import {
  sanitizeToJsonAttr,
  isBinaryContent,
} from '../../src/core/sanitize-payload';

describe('sanitize-payload', () => {
  describe('isBinaryContent()', () => {
    it('detects data URI as binary', () => {
      expect(isBinaryContent('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    });

    it('detects long base64 string (>92% base64 chars) as binary', () => {
      const base64 = 'A'.repeat(300); // 100% base64 chars
      expect(isBinaryContent(base64)).toBe(true);
    });

    it('does not detect short strings as binary', () => {
      expect(isBinaryContent('hello world')).toBe(false);
    });

    it('does not detect normal JSON as binary', () => {
      expect(isBinaryContent('{"name":"test","value":42}')).toBe(false);
    });

    it('does not flag short base64-looking strings (<256 chars)', () => {
      const short = 'dGVzdA=='; // "test" in base64, short
      expect(isBinaryContent(short)).toBe(false);
    });
  });

  describe('sanitizeToJsonAttr()', () => {
    it('returns null for null payload', () => {
      expect(sanitizeToJsonAttr(null)).toBeNull();
    });

    it('returns null for undefined payload', () => {
      expect(sanitizeToJsonAttr(undefined)).toBeNull();
    });

    it('returns null when maxBytes = 0', () => {
      expect(sanitizeToJsonAttr({ key: 'value' }, { maxBytes: 0 })).toBeNull();
    });

    it('returns null for empty object', () => {
      expect(sanitizeToJsonAttr({})).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(sanitizeToJsonAttr([])).toBeNull();
    });

    it('serializes a simple object to JSON string', () => {
      const result = sanitizeToJsonAttr({ name: 'test', value: 42 });
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.name).toBe('test');
      expect(parsed.value).toBe(42);
    });

    it('redacts default sensitive fields', () => {
      const result = sanitizeToJsonAttr({ username: 'alice', password: 'secret123' });
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.username).toBe('alice');
    });

    it('redacts custom sensitive fields', () => {
      const result = sanitizeToJsonAttr(
        { name: 'alice', ssn: '123-45-6789', cpf: '123.456.789-00' },
        { sensitiveFields: new Set(['ssn', 'cpf']) },
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.ssn).toBe('[REDACTED]');
      expect(parsed.cpf).toBe('[REDACTED]');
      expect(parsed.name).toBe('alice');
    });

    it('redacts nested sensitive fields', () => {
      const result = sanitizeToJsonAttr({
        user: { name: 'bob', token: 'abc123' },
      });
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.user.token).toBe('[REDACTED]');
      expect(parsed.user.name).toBe('bob');
    });

    it('truncates output at maxBytes with [truncated] indicator', () => {
      const big = { data: 'x'.repeat(1000) };
      const result = sanitizeToJsonAttr(big, { maxBytes: 50 });
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(50 + '[truncated]'.length + 3);
      expect(result).toContain('[truncated]');
    });

    it('does not truncate when within maxBytes', () => {
      const small = { key: 'value' };
      const result = sanitizeToJsonAttr(small, { maxBytes: 1024 });
      expect(result).not.toBeNull();
      expect(result).not.toContain('[truncated]');
    });

    it('returns non-null for data URI binary payload (field value preserved or detected)', () => {
      // sanitizeNested (from utils/sanitize) does not perform binary detection
      // on individual field values — that is the caller's responsibility.
      // sanitizeToJsonAttr does check the top-level string payload for binary
      // content, but field values inside objects pass through.
      // This test simply verifies no exception is thrown and result is a string.
      const result = sanitizeToJsonAttr({
        file: 'data:image/png;base64,' + 'A'.repeat(400),
      });
      // Result must be a non-empty JSON string (not null)
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    it('handles arrays as payload', () => {
      const result = sanitizeToJsonAttr([{ id: 1 }, { id: 2 }]);
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveLength(2);
    });

    it('handles string primitives as payload', () => {
      const result = sanitizeToJsonAttr('hello');
      // A plain string serialises to "\"hello\"" which is not empty JSON
      expect(result).toBeDefined();
    });
  });
});
