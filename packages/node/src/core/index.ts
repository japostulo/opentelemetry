/**
 * @haocruz/opentelemetry — core observability contracts.
 *
 * This barrel re-exports the five core modules that define the canonical
 * rules for profiles, payload, sanitization, semantic attributes, and
 * preflight handling.  Import from here instead of individual modules.
 *
 * @example
 * ```ts
 * import {
 *   ATTR_HTTP_REQUEST_METHOD,
 *   resolvePayloadPolicy,
 *   evaluatePreflight,
 *   sanitizeToJsonAttr,
 * } from '@haocruz/opentelemetry/core';
 * ```
 */
export * from './semantic-attributes';
export * from './observability-profile';
export * from './payload-policy';
export * from './preflight-policy';
export * from './sanitize-payload';
