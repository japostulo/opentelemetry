/**
 * Preflight (HTTP OPTIONS) request policy.
 *
 * Preflight spans are always generated to maintain distributed trace chains,
 * but are marked with `haoc.http.is_preflight = true` so dashboards can
 * filter them out.  Whether a **log record** is also emitted depends on the
 * active profile.
 *
 * | Profile  | Span created? | Span marked preflight? | Log emitted? |
 * |----------|---------------|------------------------|--------------|
 * | minimal  | yes           | yes                    | no           |
 * | standard | yes           | yes                    | no           |
 * | verbose  | yes           | yes                    | yes          |
 */
import { getProfileContract } from './observability-profile';

/** Decision object returned by {@link evaluatePreflight}. */
export interface PreflightDecision {
  /** True when the HTTP method is OPTIONS. */
  isPreflight: boolean;
  /** Whether a log record should be emitted for this request. */
  shouldLog: boolean;
}

/**
 * Evaluates whether an HTTP request is a preflight OPTIONS request and
 * whether it should produce a log record, based on the active profile.
 *
 * For non-OPTIONS requests both fields are always `true` (no special handling).
 *
 * @param method      HTTP method string (case-insensitive)
 * @param profileName Active profile name
 */
export function evaluatePreflight(
  method: string,
  profileName: string,
): PreflightDecision {
  const isPreflight = method.toUpperCase() === 'OPTIONS';

  if (!isPreflight) {
    return { isPreflight: false, shouldLog: true };
  }

  const contract = getProfileContract(profileName);
  return { isPreflight: true, shouldLog: contract.preflightLog };
}
