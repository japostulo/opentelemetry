import { AsyncLocalStorage } from 'node:async_hooks';
import { trace, context } from '@opentelemetry/api';

/**
 * Standardized user identity attributes for HAOC OpenTelemetry.
 *
 * Every application (NestJS, Express, Laravel, Web) MUST use these
 * attribute keys when setting user context on spans. This ensures
 * consistent querying in SigNoz across all services.
 *
 * The application decides HOW to populate these attributes (e.g.
 * from a JWT, session, or API key), but the lib decides WHERE
 * (which attribute keys) they are stored.
 */

// ── Attribute Keys ──────────────────────────────────────────────────────

/** Unique user identifier. Value set by each app's auth layer. */
export const HAOC_USER_ATTR = 'user.id';

/** User role (e.g. 'admin', 'operator', 'viewer'). Optional. */
export const HAOC_USER_ROLE_ATTR = 'user.role';

/**
 * User type — whether the request is authenticated, anonymous, or
 * from a service-to-service call.
 */
export const HAOC_USER_TYPE_ATTR = 'user.type';

// ── Types ───────────────────────────────────────────────────────────────

export type HaocUserType = 'authenticated' | 'anonymous' | 'service';

export interface HaocUserIdentity {
  /** Unique user identifier (e.g. user ID, email, azure_id). */
  id: string;
  /** Optional role label. */
  role?: string;
  /** Type of identity. @default 'authenticated' */
  type?: HaocUserType;
}

// ── Context Storage (AsyncLocalStorage — per-request safe) ──────────────

const _storage = new AsyncLocalStorage<HaocUserIdentity | null>();

/**
 * Per-trace identity fallback store.
 *
 * RxJS (NestJS) creates Observable subscriptions in a different async
 * resource than the one where `identifyUser()` is called inside a handler
 * (Forma 2). AsyncLocalStorage.enterWith() does not propagate across that
 * boundary, so the `tap()` callback sees an empty store.
 *
 * Storing identity by trace ID allows the interceptor's response hook to
 * reliably look up the user regardless of async context.
 */
const _perTraceIdentity = new Map<string, HaocUserIdentity>();

/**
 * Stores the current user identity in the request-scoped async context.
 * Safe for concurrent requests.
 *
 * Prefer {@link identifyUser} if you want the span attributes updated
 * immediately (e.g. when auth runs after the trace middleware).
 *
 * @example
 * ```ts
 * // In a NestJS guard
 * setUser({ id: user.azureId, role: 'admin', type: 'authenticated' });
 * ```
 */
export function setUser(identity: HaocUserIdentity): void {
  _storage.enterWith(identity);
}

/** Clears the current user identity for this request context. */
export function clearUser(): void {
  _storage.enterWith(null);
}

/** Returns the current user identity for this request, or null if not set. */
export function getUser(): HaocUserIdentity | null {
  return _storage.getStore() ?? null;
}

/**
 * Sets the user identity AND immediately writes the attributes to the
 * active OpenTelemetry span.
 *
 * Use this when your auth middleware runs **after** the trace middleware,
 * so the span attributes are updated right away rather than waiting for
 * the response hook.
 *
 * @example
 * ```ts
 * // Express — in an auth middleware
 * app.use((req, res, next) => {
 *   const token = req.headers.authorization;
 *   const user = verifyToken(token);
 *   identifyUser({ id: user.sub, role: user.role });
 *   next();
 * });
 *
 * // NestJS — in a guard
 * identifyUser({ id: request.user.id, role: request.user.role });
 * ```
 */
export function identifyUser(identity: HaocUserIdentity): void {
  setUser(identity);
  const span = trace.getSpan(context.active());
  if (!span) return;
  span.setAttribute(HAOC_USER_ATTR, identity.id);
  span.setAttribute(HAOC_USER_TYPE_ATTR, identity.type ?? 'authenticated');
  if (identity.role) span.setAttribute(HAOC_USER_ROLE_ATTR, identity.role);
  // Fallback: store by trace ID so the interceptor's tap() can look it up
  // even when AsyncLocalStorage context propagation fails across RxJS boundaries.
  const traceId = span.spanContext().traceId;
  if (traceId) _perTraceIdentity.set(traceId, identity);
}

/**
 * Returns the span attributes for the current user identity.
 * Returns an empty object if no user is set (avoids overwriting attributes
 * already written to the span by {@link identifyUser}).
 */
export function getUserSpanAttributes(): Record<string, string> {
  const user = _storage.getStore() ?? null;

  if (!user) {
    return {};
  }

  const attrs: Record<string, string> = {
    [HAOC_USER_ATTR]: user.id,
    [HAOC_USER_TYPE_ATTR]: user.type ?? 'authenticated',
  };

  if (user.role) {
    attrs[HAOC_USER_ROLE_ATTR] = user.role;
  }

  return attrs;
}

/**
 * Looks up user identity by OpenTelemetry trace ID.
 *
 * Used as a fallback inside NestJS interceptors when `getUserSpanAttributes()`
 * returns empty due to AsyncLocalStorage not propagating across RxJS
 * Observable subscription boundaries (Forma 2 — handler-level identity).
 *
 * @param traceId - The traceId from `span.spanContext().traceId`
 */
export function getUserByTraceId(traceId: string): HaocUserIdentity | null {
  return _perTraceIdentity.get(traceId) ?? null;
}

/**
 * Removes the identity entry for the given trace ID from the per-trace store.
 * Call this at the end of the request (e.g. in an RxJS `finalize()` operator).
 */
export function clearUserByTraceId(traceId: string): void {
  _perTraceIdentity.delete(traceId);
}
