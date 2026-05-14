/**
 * Payload capture policy resolution.
 *
 * Combines profile contract defaults with environment-variable overrides and
 * programmatic limits to produce the definitive payload policy for a request.
 *
 * Environment variables (all optional):
 *   OTEL_MAX_REQUEST_BODY_BYTES    — override max request body bytes
 *   OTEL_MAX_RESPONSE_BODY_BYTES   — override max response body bytes
 *   OTEL_MAX_ATTRIBUTE_VALUE_BYTES — max bytes for any single attribute value
 *
 * Precedence: programmatic overrides > env vars > profile defaults.
 */
import type { PayloadMode } from './observability-profile';
import { getProfileContract } from './observability-profile';

const ENV_MAX_REQ  = 'OTEL_MAX_REQUEST_BODY_BYTES';
const ENV_MAX_RES  = 'OTEL_MAX_RESPONSE_BODY_BYTES';
const ENV_MAX_ATTR = 'OTEL_MAX_ATTRIBUTE_VALUE_BYTES';

/** Default max bytes for a single OTel attribute value string. */
export const DEFAULT_MAX_ATTRIBUTE_BYTES = 64 * 1024; // 64 KB

/** Byte-limit triplet for payload capture. */
export interface PayloadLimits {
  /** Max request body bytes to capture. 0 = do not capture. */
  maxRequestBytes: number;
  /** Max response body bytes to capture. 0 = do not capture. */
  maxResponseBytes: number;
  /** Max bytes for any single OTel attribute string value. */
  maxAttributeBytes: number;
}

/** Resolved payload capture policy for the current request. */
export interface PayloadPolicy {
  /** How request/response body is written to span attributes. */
  spanPayloadMode: PayloadMode;
  /** How request/response body is written to log attributes. */
  logPayloadMode: PayloadMode;
  /** Byte limits in effect for this policy. */
  limits: PayloadLimits;
}

/** Programmatic overrides passed to {@link resolvePayloadPolicy}. */
export interface PayloadPolicyOverrides {
  /** Override max request body bytes for this service. */
  maxRequestBytes?: number;
  /** Override max response body bytes for this service. */
  maxResponseBytes?: number;
  /** Override max attribute value bytes for this service. */
  maxAttributeBytes?: number;
}

/**
 * Resolves the full payload policy for a given profile.
 *
 * @param profileName Active profile name (minimal | standard | verbose)
 * @param overrides   Optional programmatic overrides for byte limits
 */
export function resolvePayloadPolicy(
  profileName: string,
  overrides?: PayloadPolicyOverrides,
): PayloadPolicy {
  const contract = getProfileContract(profileName);

  const envReq  = parseNonNegativeInt(process.env[ENV_MAX_REQ]);
  const envRes  = parseNonNegativeInt(process.env[ENV_MAX_RES]);
  const envAttr = parseNonNegativeInt(process.env[ENV_MAX_ATTR]);

  return {
    spanPayloadMode: contract.spanPayloadMode,
    logPayloadMode: contract.logPayloadMode,
    limits: {
      maxRequestBytes:  overrides?.maxRequestBytes  ?? envReq  ?? contract.defaultMaxRequestBytes,
      maxResponseBytes: overrides?.maxResponseBytes ?? envRes  ?? contract.defaultMaxResponseBytes,
      maxAttributeBytes: overrides?.maxAttributeBytes ?? envAttr ?? DEFAULT_MAX_ATTRIBUTE_BYTES,
    },
  };
}

function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = parseInt(value, 10);
  return !isNaN(n) && n >= 0 ? n : undefined;
}
