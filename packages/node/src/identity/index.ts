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
export const HAOC_USER_ATTR = 'haoc.user.id';

/** User role (e.g. 'admin', 'operator', 'viewer'). Optional. */
export const HAOC_USER_ROLE_ATTR = 'haoc.user.role';

/**
 * User type — whether the request is authenticated, anonymous, or
 * from a service-to-service call.
 */
export const HAOC_USER_TYPE_ATTR = 'haoc.user.type';

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

// ── Context Storage ─────────────────────────────────────────────────────

let _currentUser: HaocUserIdentity | null = null;

/**
 * Sets the current user identity for the running context.
 *
 * Call this from your auth guard/middleware after identifying the user.
 * The trace interceptor will automatically copy these attributes to
 * every span.
 *
 * @example
 * ```ts
 * // In a NestJS guard
 * setUser({ id: user.id, role: 'admin', type: 'authenticated' });
 * ```
 */
export function setUser(identity: HaocUserIdentity): void {
  _currentUser = identity;
}

/** Clears the current user identity (e.g. on logout or request end). */
export function clearUser(): void {
  _currentUser = null;
}

/** Returns the current user identity, or null if not set. */
export function getUser(): HaocUserIdentity | null {
  return _currentUser;
}

/**
 * Returns the span attributes for the current user identity.
 * If no user is set, returns anonymous attributes.
 */
export function getUserSpanAttributes(): Record<string, string> {
  if (!_currentUser) {
    return { [HAOC_USER_TYPE_ATTR]: 'anonymous' };
  }

  const attrs: Record<string, string> = {
    [HAOC_USER_ATTR]: _currentUser.id,
    [HAOC_USER_TYPE_ATTR]: _currentUser.type ?? 'authenticated',
  };

  if (_currentUser.role) {
    attrs[HAOC_USER_ROLE_ATTR] = _currentUser.role;
  }

  return attrs;
}
