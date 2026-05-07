// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENSITIVE_FIELDS,
  isSensitive,
  mergeSensitiveFields,
} from '../src/utils/sanitize';

// ── DEFAULT_SENSITIVE_FIELDS ───────────────────────────────────────────────
describe('DEFAULT_SENSITIVE_FIELDS', () => {
  const expected = [
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
    'cpf',
    'rg',
    'cnpj',
    'cartao_sus',
    'cns',
  ];

  it('contains all required HAOC sensitive field names', () => {
    for (const field of expected) {
      expect(
        DEFAULT_SENSITIVE_FIELDS.has(field),
        `DEFAULT_SENSITIVE_FIELDS must contain '${field}'`,
      ).toBe(true);
    }
  });

  it('is a Set', () => {
    expect(DEFAULT_SENSITIVE_FIELDS).toBeInstanceOf(Set);
  });
});

// ── isSensitive ─────────────────────────────────────────────────────────
describe('isSensitive', () => {
  it('returns true for known sensitive fields (case-sensitive as stored)', () => {
    expect(isSensitive('password')).toBe(true);
    expect(isSensitive('cpf')).toBe(true);
    expect(isSensitive('token')).toBe(true);
    expect(isSensitive('authorization')).toBe(true);
    expect(isSensitive('cnpj')).toBe(true);
    expect(isSensitive('cartao_sus')).toBe(true);
    expect(isSensitive('cns')).toBe(true);
  });

  it('returns true for UPPERCASE / mixed-case variants (case-insensitive)', () => {
    expect(isSensitive('PASSWORD')).toBe(true);
    expect(isSensitive('Password')).toBe(true);
    expect(isSensitive('CPF')).toBe(true);
    expect(isSensitive('ACCESS_TOKEN')).toBe(true);
    expect(isSensitive('Authorization')).toBe(true);
  });

  it('returns false for non-sensitive fields', () => {
    expect(isSensitive('name')).toBe(false);
    expect(isSensitive('email')).toBe(false);
    expect(isSensitive('userId')).toBe(false);
    expect(isSensitive('status')).toBe(false);
  });

  it('uses DEFAULT_SENSITIVE_FIELDS when no set is provided', () => {
    expect(isSensitive('senha')).toBe(true);
  });

  it('respects a custom sensitive fields set', () => {
    const custom = new Set(['customfield', 'anothersecret']);
    expect(isSensitive('customfield', custom)).toBe(true);
    expect(isSensitive('anothersecret', custom)).toBe(true);
    // Default fields should NOT match unless added to custom set
    expect(isSensitive('password', custom)).toBe(false);
  });
});

// ── mergeSensitiveFields ───────────────────────────────────────────────
describe('mergeSensitiveFields', () => {
  it('returns a Set containing all defaults when called with no args', () => {
    const merged = mergeSensitiveFields();
    for (const f of DEFAULT_SENSITIVE_FIELDS) {
      expect(merged.has(f)).toBe(true);
    }
  });

  it('adds extra fields to the default set', () => {
    const merged = mergeSensitiveFields(['customsecret', 'oauthkey']);
    expect(merged.has('customsecret')).toBe(true);
    expect(merged.has('oauthkey')).toBe(true);
    // Defaults still present
    expect(merged.has('password')).toBe(true);
  });

  it('lowercases extra fields when merging', () => {
    const merged = mergeSensitiveFields(['MYSECRET', 'MyToken']);
    expect(merged.has('mysecret')).toBe(true);
    expect(merged.has('mytoken')).toBe(true);
    expect(merged.has('MYSECRET')).toBe(false);
  });

  it('does not mutate DEFAULT_SENSITIVE_FIELDS', () => {
    const beforeSize = DEFAULT_SENSITIVE_FIELDS.size;
    mergeSensitiveFields(['newfield']);
    expect(DEFAULT_SENSITIVE_FIELDS.size).toBe(beforeSize);
    expect(DEFAULT_SENSITIVE_FIELDS.has('newfield')).toBe(false);
  });

  it('works with a Set as extra', () => {
    const extra = new Set(['extrakey']);
    const merged = mergeSensitiveFields(extra);
    expect(merged.has('extrakey')).toBe(true);
    expect(merged.has('password')).toBe(true);
  });

  it('handles empty iterable gracefully', () => {
    const merged = mergeSensitiveFields([]);
    expect(merged.size).toBe(DEFAULT_SENSITIVE_FIELDS.size);
  });

  it('returns a new Set (not the same reference as DEFAULT_SENSITIVE_FIELDS)', () => {
    const merged = mergeSensitiveFields();
    expect(merged).not.toBe(DEFAULT_SENSITIVE_FIELDS);
  });
});

// ── redaction integration: sensitive in nested payload ──────────────────
describe('redaction integration', () => {
  it('isSensitive correctly identifies fields to protect in a realistic payload', () => {
    const payload = {
      user: { name: 'João', email: 'joao@example.com', cpf: '123.456.789-00' },
      order: { id: 'abc-123', amount: 99.9 },
      password: 'S3cret!',
    };

    // Simulating what flatten does: check each leaf field name
    expect(isSensitive('name')).toBe(false);    // plain text — OK
    expect(isSensitive('email')).toBe(false);   // note: email is NOT in defaults; intentional
    expect(isSensitive('cpf')).toBe(true);      // PII — must be redacted
    expect(isSensitive('id')).toBe(false);
    expect(isSensitive('amount')).toBe(false);
    expect(isSensitive('password')).toBe(true); // credentials — must be redacted

    // Silence TS unused-variable warning
    void payload;
  });
});
