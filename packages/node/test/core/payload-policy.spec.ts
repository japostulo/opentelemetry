import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolvePayloadPolicy,
  DEFAULT_MAX_ATTRIBUTE_BYTES,
} from '../../src/core/payload-policy';

describe('payload-policy', () => {
  // Save and restore env vars around each test
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.OTEL_MAX_REQUEST_BODY_BYTES;
    delete process.env.OTEL_MAX_RESPONSE_BODY_BYTES;
    delete process.env.OTEL_MAX_ATTRIBUTE_VALUE_BYTES;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('profile defaults (no overrides)', () => {
    it('minimal — returns 0 for maxReq and maxRes', () => {
      const policy = resolvePayloadPolicy('minimal');
      expect(policy.limits.maxRequestBytes).toBe(0);
      expect(policy.limits.maxResponseBytes).toBe(0);
    });

    it('minimal — spanPayloadMode and logPayloadMode = none', () => {
      const policy = resolvePayloadPolicy('minimal');
      expect(policy.spanPayloadMode).toBe('none');
      expect(policy.logPayloadMode).toBe('none');
    });

    it('standard — maxReqBytes = 16 KB', () => {
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxRequestBytes).toBe(16 * 1024);
      expect(policy.limits.maxResponseBytes).toBe(16 * 1024);
    });

    it('standard — spanPayloadMode = none, logPayloadMode = json-attr', () => {
      const policy = resolvePayloadPolicy('standard');
      expect(policy.spanPayloadMode).toBe('none');
      expect(policy.logPayloadMode).toBe('json-attr');
    });

    it('verbose — maxReqBytes = 64 KB', () => {
      const policy = resolvePayloadPolicy('verbose');
      expect(policy.limits.maxRequestBytes).toBe(64 * 1024);
      expect(policy.limits.maxResponseBytes).toBe(64 * 1024);
    });

    it('verbose — spanPayloadMode = flatten, logPayloadMode = json-attr', () => {
      const policy = resolvePayloadPolicy('verbose');
      expect(policy.spanPayloadMode).toBe('flatten');
      expect(policy.logPayloadMode).toBe('json-attr');
    });

    it('default maxAttributeBytes = 64 KB', () => {
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxAttributeBytes).toBe(DEFAULT_MAX_ATTRIBUTE_BYTES);
      expect(DEFAULT_MAX_ATTRIBUTE_BYTES).toBe(64 * 1024);
    });
  });

  describe('environment variable overrides', () => {
    it('OTEL_MAX_REQUEST_BODY_BYTES overrides request limit', () => {
      process.env.OTEL_MAX_REQUEST_BODY_BYTES = '4096';
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxRequestBytes).toBe(4096);
    });

    it('OTEL_MAX_RESPONSE_BODY_BYTES overrides response limit', () => {
      process.env.OTEL_MAX_RESPONSE_BODY_BYTES = '8192';
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxResponseBytes).toBe(8192);
    });

    it('OTEL_MAX_ATTRIBUTE_VALUE_BYTES overrides attr limit', () => {
      process.env.OTEL_MAX_ATTRIBUTE_VALUE_BYTES = '2048';
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxAttributeBytes).toBe(2048);
    });

    it('ignores non-numeric env values gracefully (falls back to profile default)', () => {
      process.env.OTEL_MAX_REQUEST_BODY_BYTES = 'not-a-number';
      const policy = resolvePayloadPolicy('standard');
      expect(policy.limits.maxRequestBytes).toBe(16 * 1024);
    });
  });

  describe('programmatic overrides (highest precedence)', () => {
    it('programmatic maxRequestBytes wins over env var', () => {
      process.env.OTEL_MAX_REQUEST_BODY_BYTES = '4096';
      const policy = resolvePayloadPolicy('standard', { maxRequestBytes: 1024 });
      expect(policy.limits.maxRequestBytes).toBe(1024);
    });

    it('programmatic maxResponseBytes wins over profile default', () => {
      const policy = resolvePayloadPolicy('minimal', { maxResponseBytes: 32768 });
      expect(policy.limits.maxResponseBytes).toBe(32768);
    });

    it('programmatic maxAttributeBytes wins', () => {
      const policy = resolvePayloadPolicy('verbose', { maxAttributeBytes: 512 });
      expect(policy.limits.maxAttributeBytes).toBe(512);
    });
  });

  describe('unknown profile falls back to minimal', () => {
    it('unknown profile → all limits are 0 (minimal fallback)', () => {
      const policy = resolvePayloadPolicy('nonexistent');
      expect(policy.limits.maxRequestBytes).toBe(0);
      expect(policy.limits.maxResponseBytes).toBe(0);
      expect(policy.spanPayloadMode).toBe('none');
      expect(policy.logPayloadMode).toBe('none');
    });
  });
});
