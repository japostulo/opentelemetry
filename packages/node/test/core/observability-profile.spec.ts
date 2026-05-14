import { describe, it, expect } from 'vitest';
import {
  PROFILE_CONTRACTS,
  getProfileContract,
} from '../../src/core/observability-profile';
import type { PayloadMode } from '../../src/core/observability-profile';

describe('observability-profile', () => {
  describe('PROFILE_CONTRACTS', () => {
    it('defines all three profiles', () => {
      expect(PROFILE_CONTRACTS).toHaveProperty('minimal');
      expect(PROFILE_CONTRACTS).toHaveProperty('standard');
      expect(PROFILE_CONTRACTS).toHaveProperty('verbose');
    });

    describe('minimal', () => {
      const c = PROFILE_CONTRACTS['minimal'];

      it('spanPayloadMode = none', () => expect(c.spanPayloadMode).toBe('none'));
      it('logPayloadMode = none', () => expect(c.logPayloadMode).toBe('none'));
      it('preflightLog = false', () => expect(c.preflightLog).toBe(false));
      it('maxReqBytes = 0', () => expect(c.defaultMaxRequestBytes).toBe(0));
      it('maxResBytes = 0', () => expect(c.defaultMaxResponseBytes).toBe(0));
    });

    describe('standard', () => {
      const c = PROFILE_CONTRACTS['standard'];

      it('spanPayloadMode = none', () => expect(c.spanPayloadMode).toBe('none'));
      it('logPayloadMode = json-attr', () => expect(c.logPayloadMode).toBe('json-attr'));
      it('preflightLog = false', () => expect(c.preflightLog).toBe(false));
      it('maxReqBytes = 16 KB', () => expect(c.defaultMaxRequestBytes).toBe(16 * 1024));
      it('maxResBytes = 16 KB', () => expect(c.defaultMaxResponseBytes).toBe(16 * 1024));
    });

    describe('verbose', () => {
      const c = PROFILE_CONTRACTS['verbose'];

      it('spanPayloadMode = flatten', () => expect(c.spanPayloadMode).toBe('flatten'));
      it('logPayloadMode = json-attr', () => expect(c.logPayloadMode).toBe('json-attr'));
      it('preflightLog = true', () => expect(c.preflightLog).toBe(true));
      it('maxReqBytes = 64 KB', () => expect(c.defaultMaxRequestBytes).toBe(64 * 1024));
      it('maxResBytes = 64 KB', () => expect(c.defaultMaxResponseBytes).toBe(64 * 1024));
    });
  });

  describe('getProfileContract()', () => {
    it('returns the correct contract for minimal', () => {
      const c = getProfileContract('minimal');
      expect(c.logPayloadMode).toBe('none');
    });

    it('returns the correct contract for standard', () => {
      const c = getProfileContract('standard');
      expect(c.logPayloadMode).toBe('json-attr');
      expect(c.spanPayloadMode).toBe('none');
    });

    it('returns the correct contract for verbose', () => {
      const c = getProfileContract('verbose');
      expect(c.logPayloadMode).toBe('json-attr');
      expect(c.spanPayloadMode).toBe('flatten');
    });

    it('falls back to minimal for unknown profile names', () => {
      const c = getProfileContract('nonexistent');
      expect(c.logPayloadMode).toBe('none');
      expect(c.spanPayloadMode).toBe('none');
      expect(c.defaultMaxRequestBytes).toBe(0);
    });

    it('falls back to minimal for empty string', () => {
      const c = getProfileContract('');
      expect(c.logPayloadMode).toBe('none');
    });
  });

  describe('PayloadMode type values', () => {
    it('the three valid modes are correct strings', () => {
      const modes: PayloadMode[] = ['none', 'json-attr', 'flatten'];
      expect(modes).toHaveLength(3);
      expect(modes).toContain('none');
      expect(modes).toContain('json-attr');
      expect(modes).toContain('flatten');
    });
  });
});
