/**
 * Standardized user identity attributes for HAOC OpenTelemetry (Web).
 *
 * Same attribute keys as the Node package — ensures consistent querying
 * in SigNoz across frontend and backend services.
 */

// ── Attribute Keys ──────────────────────────────────────────────────────

export const USER_ATTR = 'user.id';
export const USER_ROLE_ATTR = 'user.role';
export const USER_TYPE_ATTR = 'user.type';
/** @deprecated Use {@link USER_ATTR} */
export const HAOC_USER_ATTR = USER_ATTR;
/** @deprecated Use {@link USER_ROLE_ATTR} */
export const HAOC_USER_ROLE_ATTR = USER_ROLE_ATTR;
/** @deprecated Use {@link USER_TYPE_ATTR} */
export const HAOC_USER_TYPE_ATTR = USER_TYPE_ATTR;

// ── Types ───────────────────────────────────────────────────────────────

export type UserType = 'authenticated' | 'anonymous' | 'service';
/** @deprecated Use {@link UserType} */
export type HaocUserType = UserType;

export interface UserIdentity {
  id: string;
  role?: string;
  type?: UserType;
}
/** @deprecated Use {@link UserIdentity} */
export type HaocUserIdentity = UserIdentity;

// ── Module-level Storage ────────────────────────────────────────────────

let _currentUser: UserIdentity | null = null;

/**
 * Sets the current user identity. Call after login/auth.
 * The HaocSpanProcessor will automatically add these attributes to every span.
 */
export function setUser(identity: UserIdentity): void {
  _currentUser = identity;
}

/** Clears the current user (e.g. on logout). */
export function clearUser(): void {
  _currentUser = null;
}

/** Returns the current user identity, or null. */
export function getUser(): UserIdentity | null {
  return _currentUser;
}
