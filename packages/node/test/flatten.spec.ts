// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { flattenToRecord, flattenToSpan } from '../src/utils/flatten';
import { DEFAULT_SENSITIVE_FIELDS } from '../src/utils/sanitize';

// ── flattenToRecord ────────────────────────────────────────────────────────
describe('flattenToRecord', () => {
  it('flattens nested objects with dot notation under prefix', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(
      record,
      'haoc.request.body',
      { user: { name: 'João', email: 'joao@example.com' }, order: { id: 'abc-123', amount: 99.9 } },
    );
    expect(record['haoc.request.body.user.name']).toBe('João');
    expect(record['haoc.request.body.user.email']).toBe('joao@example.com');
    expect(record['haoc.request.body.order.id']).toBe('abc-123');
    expect(record['haoc.request.body.order.amount']).toBe(99.9);
  });

  it('preserves number type (does not stringify)', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', { count: 42, ratio: 0.5 });
    expect(typeof record['haoc.request.body.count']).toBe('number');
    expect(record['haoc.request.body.count']).toBe(42);
    expect(record['haoc.request.body.ratio']).toBe(0.5);
  });

  it('preserves boolean type', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', { active: true, deleted: false });
    expect(typeof record['haoc.request.body.active']).toBe('boolean');
    expect(record['haoc.request.body.active']).toBe(true);
    expect(record['haoc.request.body.deleted']).toBe(false);
  });

  it('redacts sensitive fields from DEFAULT_SENSITIVE_FIELDS', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', {
      user: { name: 'João', cpf: '12345678900' },
      password: 'S3cret!',
    });
    expect(record['haoc.request.body.user.name']).toBe('João');
    expect(record['haoc.request.body.user.cpf']).toBe('[REDACTED]');
    expect(record['haoc.request.body.password']).toBe('[REDACTED]');
  });

  it('redacts all default sensitive field names', () => {
    const sensitivePayload: Record<string, string> = {
      password: 'p',
      senha: 's',
      token: 't',
      access_token: 'at',
      refresh_token: 'rt',
      authorization: 'auth',
      secret: 'sec',
      cpf: '123',
      rg: '456',
      cnpj: '789',
      cartao_sus: 'c',
      cns: 'cns',
    };
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', sensitivePayload, 0, DEFAULT_SENSITIVE_FIELDS);
    for (const key of Object.keys(sensitivePayload)) {
      expect(record[`haoc.request.body.${key}`], `${key} should be redacted`).toBe('[REDACTED]');
    }
  });

  it('serializes arrays as JSON string (not recursed)', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', { items: ['a', 'b', 'c'] });
    expect(typeof record['haoc.request.body.items']).toBe('string');
    expect(JSON.parse(record['haoc.request.body.items'] as string)).toEqual(['a', 'b', 'c']);
  });

  it('skips null and undefined values', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', { a: null, b: undefined, c: 'valid' });
    expect('haoc.request.body.a' in record).toBe(false);
    expect('haoc.request.body.b' in record).toBe(false);
    expect(record['haoc.request.body.c']).toBe('valid');
  });

  it('expands JSON-string values recursively', () => {
    const record = {} as Record<string, unknown>;
    const inner = JSON.stringify({ nested: 'value' });
    flattenToRecord(record, 'haoc.request.body', { data: inner });
    expect(record['haoc.request.body.data.nested']).toBe('value');
  });

  it('respects MAX_FLATTEN_DEPTH (stops at depth 4)', () => {
    const deep: Record<string, unknown> = {};
    // Build a 6-level deep object: a.b.c.d.e.f = 'leaf'
    let node: Record<string, unknown> = deep;
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < keys.length - 1; i++) {
      node[keys[i]] = {};
      node = node[keys[i]] as Record<string, unknown>;
    }
    node[keys[keys.length - 1]] = 'leaf';

    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'p', deep);
    // p.a.b.c.d should appear (depth 4 from root), but p.a.b.c.d.e.f is too deep
    expect(record['p.a.b.c.d.e.f']).toBeUndefined();
  });

  it('supports custom sensitive fields set', () => {
    const custom = new Set(['customsecret']);
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', { customsecret: 'oops', safe: 'ok' }, 0, custom);
    expect(record['haoc.request.body.customsecret']).toBe('[REDACTED]');
    expect(record['haoc.request.body.safe']).toBe('ok');
  });

  it('handles top-level non-object primitive', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', 42 as unknown);
    expect(record['haoc.request.body']).toBe(42);
  });

  it('handles top-level array', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.body', [1, 2, 3] as unknown);
    expect(typeof record['haoc.request.body']).toBe('string');
  });

  it('works with haoc.response.body prefix', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.response.body', { status: 'ok', data: { id: 1 } });
    expect(record['haoc.response.body.status']).toBe('ok');
    expect(record['haoc.response.body.data.id']).toBe(1);
  });

  it('works with haoc.request.query prefix', () => {
    const record = {} as Record<string, unknown>;
    flattenToRecord(record, 'haoc.request.query', { page: '1', size: '20', filter: 'active' });
    expect(record['haoc.request.query.page']).toBe('1');
    expect(record['haoc.request.query.size']).toBe('20');
  });
});

// ── flattenToSpan ─────────────────────────────────────────────────────────
describe('flattenToSpan', () => {
  function makeSpan() {
    const attrs: Record<string, unknown> = {};
    return {
      setAttribute(key: string, value: unknown) {
        attrs[key] = value;
      },
      getAttrs() {
        return attrs;
      },
    };
  }

  it('sets string attribute on span', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', { name: 'João' });
    expect((span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.name']).toBe('João');
  });

  it('sets number attribute on span (preserves type)', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', { amount: 99.9 });
    expect((span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.amount']).toBe(99.9);
    expect(typeof (span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.amount']).toBe('number');
  });

  it('sets boolean attribute on span (preserves type)', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', { active: true });
    expect((span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.active']).toBe(true);
    expect(typeof (span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.active']).toBe('boolean');
  });

  it('redacts sensitive fields', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', { user: { cpf: '12345678900', name: 'João' }, password: 'x' });
    const attrs = (span as ReturnType<typeof makeSpan>).getAttrs();
    expect(attrs['haoc.request.body.user.cpf']).toBe('[REDACTED]');
    expect(attrs['haoc.request.body.password']).toBe('[REDACTED]');
    expect(attrs['haoc.request.body.user.name']).toBe('João');
  });

  it('sets array as JSON string', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', { tags: ['a', 'b'] });
    const val = (span as ReturnType<typeof makeSpan>).getAttrs()['haoc.request.body.tags'];
    expect(typeof val).toBe('string');
    expect(JSON.parse(val as string)).toEqual(['a', 'b']);
  });

  it('does nothing for null/undefined', () => {
    const span = makeSpan() as unknown as import('@opentelemetry/api').Span;
    flattenToSpan(span, 'haoc.request.body', null);
    flattenToSpan(span, 'haoc.request.body', undefined);
    expect(Object.keys((span as ReturnType<typeof makeSpan>).getAttrs())).toHaveLength(0);
  });
});
