import { describe, it, expect } from 'vitest';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_URL_QUERY,
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_HTTP_METHOD_LEGACY,
  ATTR_HTTP_STATUS_CODE_LEGACY,
  ATTR_HAOC_PROFILE,
  ATTR_HAOC_IS_PREFLIGHT,
  ATTR_HAOC_LOG_EVENT,
  ATTR_HAOC_REQUEST_JSON,
  ATTR_HAOC_RESPONSE_JSON,
  ATTR_HAOC_ERROR_JSON,
  LOG_EVENT_REQUEST,
  LOG_EVENT_RESPONSE,
  LOG_EVENT_ERROR,
  LOG_EVENT_PREFLIGHT,
} from '../../src/core/semantic-attributes';

describe('semantic-attributes', () => {
  describe('OTel Semconv v1.24+ attribute names', () => {
    it('HTTP_REQUEST_METHOD = http.request.method', () => {
      expect(ATTR_HTTP_REQUEST_METHOD).toBe('http.request.method');
    });

    it('HTTP_RESPONSE_STATUS_CODE = http.response.status_code', () => {
      expect(ATTR_HTTP_RESPONSE_STATUS_CODE).toBe('http.response.status_code');
    });

    it('HTTP_ROUTE = http.route', () => {
      expect(ATTR_HTTP_ROUTE).toBe('http.route');
    });

    it('URL_PATH = url.path', () => {
      expect(ATTR_URL_PATH).toBe('url.path');
    });

    it('URL_QUERY = url.query', () => {
      expect(ATTR_URL_QUERY).toBe('url.query');
    });

    it('URL_FULL = url.full', () => {
      expect(ATTR_URL_FULL).toBe('url.full');
    });

    it('USER_AGENT_ORIGINAL = user_agent.original', () => {
      expect(ATTR_USER_AGENT_ORIGINAL).toBe('user_agent.original');
    });

    it('SERVER_ADDRESS = server.address', () => {
      expect(ATTR_SERVER_ADDRESS).toBe('server.address');
    });

    it('SERVER_PORT = server.port', () => {
      expect(ATTR_SERVER_PORT).toBe('server.port');
    });

    it('NETWORK_PROTOCOL_VERSION = network.protocol.version', () => {
      expect(ATTR_NETWORK_PROTOCOL_VERSION).toBe('network.protocol.version');
    });
  });

  describe('Legacy aliases (backward compat)', () => {
    it('HTTP_METHOD_LEGACY = http.method', () => {
      expect(ATTR_HTTP_METHOD_LEGACY).toBe('http.method');
    });

    it('HTTP_STATUS_CODE_LEGACY = http.status_code', () => {
      expect(ATTR_HTTP_STATUS_CODE_LEGACY).toBe('http.status_code');
    });

    it('legacy names differ from current semconv names', () => {
      expect(ATTR_HTTP_METHOD_LEGACY).not.toBe(ATTR_HTTP_REQUEST_METHOD);
      expect(ATTR_HTTP_STATUS_CODE_LEGACY).not.toBe(ATTR_HTTP_RESPONSE_STATUS_CODE);
    });
  });

  describe('HAOC institutional attributes', () => {
    it("ATTR_HAOC_PROFILE = 'otel.profile'", () => {
      expect(ATTR_HAOC_PROFILE).toBe('otel.profile');
    });

    it("ATTR_HAOC_IS_PREFLIGHT = 'http.is_preflight'", () => {
      expect(ATTR_HAOC_IS_PREFLIGHT).toBe('http.is_preflight');
    });

    it("ATTR_HAOC_LOG_EVENT = 'log.event'", () => {
      expect(ATTR_HAOC_LOG_EVENT).toBe('log.event');
    });

    it("ATTR_HAOC_REQUEST_JSON = 'request.json'", () => {
      expect(ATTR_HAOC_REQUEST_JSON).toBe('request.json');
    });

    it("ATTR_HAOC_RESPONSE_JSON = 'response.json'", () => {
      expect(ATTR_HAOC_RESPONSE_JSON).toBe('response.json');
    });

    it("ATTR_HAOC_ERROR_JSON = 'error.json'", () => {
      expect(ATTR_HAOC_ERROR_JSON).toBe('error.json');
    });
  });

  describe('Log event values', () => {
    it('LOG_EVENT_REQUEST = http.request', () => {
      expect(LOG_EVENT_REQUEST).toBe('http.request');
    });

    it('LOG_EVENT_RESPONSE = http.response', () => {
      expect(LOG_EVENT_RESPONSE).toBe('http.response');
    });

    it('LOG_EVENT_ERROR = http.error', () => {
      expect(LOG_EVENT_ERROR).toBe('http.error');
    });

    it('LOG_EVENT_PREFLIGHT = http.preflight', () => {
      expect(LOG_EVENT_PREFLIGHT).toBe('http.preflight');
    });

    it('all log event values are distinct', () => {
      const values = [LOG_EVENT_REQUEST, LOG_EVENT_RESPONSE, LOG_EVENT_ERROR, LOG_EVENT_PREFLIGHT];
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });
});
