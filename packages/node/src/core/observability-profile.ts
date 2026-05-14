/**
 * Central contract for observability profiles.
 *
 * This module is the single source of truth that defines what each profile
 * means in terms of payload capture strategy, OPTIONS/preflight log handling,
 * and default byte limits.
 *
 * It is consumed by:
 * - Node middleware / NestJS interceptors (via PayloadPolicy)
 * - Web span processors
 * - Laravel middleware (mirrored in Haoc\OpenTelemetry\Profile\ObservabilityProfile)
 *
 * Contract table:
 *
 * | Profile  | spanPayloadMode | logPayloadMode | preflightLog | maxReqKB | maxResKB |
 * |----------|-----------------|----------------|--------------|----------|----------|
 * | minimal  | none            | none           | false        | 0        | 0        |
 * | standard | none            | json-attr      | false        | 16       | 16       |
 * | verbose  | flatten         | json-attr      | true         | 64       | 64       |
 */

/**
 * How payload (request/response body) is captured for a given destination.
 *
 * - `none`:      payload is not captured at all.
 * - `json-attr`: payload is sanitized, serialized to JSON, and stored in a
 *                single attribute (`haoc.request.json` / `haoc.response.json`).
 *                The log `body` remains a short human-readable string.
 * - `flatten`:   legacy behavior — payload fields are expanded into individual
 *                dot-notation attributes (`haoc.request.body.user.name`, …).
 */
export type PayloadMode = 'none' | 'json-attr' | 'flatten';

/**
 * Full behavioral contract for one named observability profile.
 */
export interface ProfileContract {
  /** Profile name identifier. */
  name: string;

  /**
   * How request/response body is written into **span** attributes.
   *
   * - `none`      → body is never written to the span (recommended for most profiles)
   * - `json-attr` → one attr `haoc.request.json` / `haoc.response.json` per span
   * - `flatten`   → individual dot-notation attrs on the span (verbose only)
   */
  spanPayloadMode: PayloadMode;

  /**
   * How request/response body is written into **log** attributes.
   *
   * - `none`      → no body in logs (minimal profile)
   * - `json-attr` → single `haoc.request.json` / `haoc.response.json` log attribute
   * - `flatten`   → individual dot-notation attrs in the log (legacy fallback)
   */
  logPayloadMode: PayloadMode;

  /**
   * Whether OPTIONS preflight requests should generate a **log record**.
   *
   * Preflight spans are always generated (to maintain distributed trace chains)
   * but are marked with `haoc.http.is_preflight = true` so they can be filtered
   * in dashboards. Only `verbose` enables log records for OPTIONS.
   */
  preflightLog: boolean;

  /** Default max request body bytes for this profile. 0 = capture disabled. */
  defaultMaxRequestBytes: number;

  /** Default max response body bytes for this profile. 0 = capture disabled. */
  defaultMaxResponseBytes: number;
}

/**
 * Canonical profile contracts.
 *
 * Unknown profile names fall back to `minimal` via {@link getProfileContract}.
 */
export const PROFILE_CONTRACTS: Readonly<Record<string, ProfileContract>> = {
  minimal: {
    name: 'minimal',
    spanPayloadMode: 'none',
    logPayloadMode: 'none',
    preflightLog: false,
    defaultMaxRequestBytes: 0,
    defaultMaxResponseBytes: 0,
  },

  standard: {
    name: 'standard',
    spanPayloadMode: 'none',       // body does NOT go into span attributes
    logPayloadMode: 'json-attr',   // body goes into haoc.request.json log attr
    preflightLog: false,
    defaultMaxRequestBytes: 16 * 1024,   // 16 KB
    defaultMaxResponseBytes: 16 * 1024,  // 16 KB
  },

  verbose: {
    name: 'verbose',
    spanPayloadMode: 'flatten',    // body flattened into span attributes (legacy)
    logPayloadMode: 'json-attr',   // also captured as JSON in log attribute
    preflightLog: true,            // OPTIONS generates a log record
    defaultMaxRequestBytes: 64 * 1024,   // 64 KB
    defaultMaxResponseBytes: 64 * 1024,  // 64 KB
  },
} as const;

/**
 * Returns the contract for a given profile name.
 * Falls back to `minimal` for unknown names.
 */
export function getProfileContract(name: string): ProfileContract {
  return PROFILE_CONTRACTS[name] ?? PROFILE_CONTRACTS['minimal'];
}
