/**
 * Standardized user identity attributes for HAOC OpenTelemetry (Web).
 *
 * Same attribute keys as the Node package — ensures consistent querying
 * in SigNoz across frontend and backend services.
 */

// ── Attribute Keys ──────────────────────────────────────────────────────

export const HAOC_USER_ATTR = 'user.id';
export const HAOC_USER_ROLE_ATTR = 'user.role';
export const HAOC_USER_TYPE_ATTR = 'user.type';

// ── Types ───────────────────────────────────────────────────────────────

export type HaocUserType = 'authenticated' | 'anonymous' | 'service';

export interface HaocUserIdentity {
  id: string;
  role?: string;
  type?: HaocUserType;
}

// ── Module-level Storage ────────────────────────────────────────────────

let _currentUser: HaocUserIdentity | null = null;

/**
 * Sets the current user identity. Call after login/auth.
 * The HaocSpanProcessor will automatically add these attributes to every span.
 */
export function setUser(identity: HaocUserIdentity): void {
  _currentUser = identity;
}

/** Clears the current user (e.g. on logout). */
export function clearUser(): void {
  _currentUser = null;
}

/** Returns the current user identity, or null. */
export function getUser(): HaocUserIdentity | null {
  return _currentUser;
}
