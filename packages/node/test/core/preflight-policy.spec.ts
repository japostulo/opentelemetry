import { describe, it, expect } from 'vitest';
import { evaluatePreflight } from '../../src/core/preflight-policy';

describe('preflight-policy', () => {
  describe('OPTIONS requests', () => {
    it('OPTIONS + minimal → isPreflight=true, shouldLog=false', () => {
      const result = evaluatePreflight('OPTIONS', 'minimal');
      expect(result.isPreflight).toBe(true);
      expect(result.shouldLog).toBe(false);
    });

    it('OPTIONS + standard → isPreflight=true, shouldLog=false', () => {
      const result = evaluatePreflight('OPTIONS', 'standard');
      expect(result.isPreflight).toBe(true);
      expect(result.shouldLog).toBe(false);
    });

    it('OPTIONS + verbose → isPreflight=true, shouldLog=true', () => {
      const result = evaluatePreflight('OPTIONS', 'verbose');
      expect(result.isPreflight).toBe(true);
      expect(result.shouldLog).toBe(true);
    });
  });

  describe('non-OPTIONS requests', () => {
    it('GET + minimal → isPreflight=false, shouldLog=true', () => {
      const result = evaluatePreflight('GET', 'minimal');
      expect(result.isPreflight).toBe(false);
      expect(result.shouldLog).toBe(true);
    });

    it('POST + standard → isPreflight=false, shouldLog=true', () => {
      const result = evaluatePreflight('POST', 'standard');
      expect(result.isPreflight).toBe(false);
      expect(result.shouldLog).toBe(true);
    });

    it('DELETE + verbose → isPreflight=false, shouldLog=true', () => {
      const result = evaluatePreflight('DELETE', 'verbose');
      expect(result.isPreflight).toBe(false);
      expect(result.shouldLog).toBe(true);
    });

    it('PUT + unknown profile → isPreflight=false, shouldLog=true', () => {
      const result = evaluatePreflight('PUT', 'nonexistent');
      expect(result.isPreflight).toBe(false);
      expect(result.shouldLog).toBe(true);
    });

    it('PATCH + standard → isPreflight=false, shouldLog=true', () => {
      const result = evaluatePreflight('PATCH', 'standard');
      expect(result.isPreflight).toBe(false);
      expect(result.shouldLog).toBe(true);
    });
  });

  describe('case insensitivity of method', () => {
    it('lowercase "options" is still a preflight', () => {
      const result = evaluatePreflight('options', 'standard');
      expect(result.isPreflight).toBe(true);
    });

    it('mixed case "Options" is still a preflight', () => {
      const result = evaluatePreflight('Options', 'verbose');
      expect(result.isPreflight).toBe(true);
      expect(result.shouldLog).toBe(true);
    });
  });
});
