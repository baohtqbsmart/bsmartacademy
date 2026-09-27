/**
 * "Remember me": when a user signs in without it, their auth cookies are
 * written as browser-session cookies (no Max-Age/Expires), so closing the
 * browser signs them out. The choice itself is remembered in this cookie.
 */
export const SESSION_ONLY_COOKIE = "bsmart_session_only"

type CookieOptions = { maxAge?: number; expires?: Date | number | string } & Record<string, unknown>

export function applySessionPolicy<T extends CookieOptions | undefined>(options: T, sessionOnly: boolean): T {
  if (!sessionOnly || !options) return options
  // Deleting a cookie (Max-Age 0) must keep working.
  if (options.maxAge !== undefined && options.maxAge <= 0) return options
  const rest = { ...options }
  delete rest.maxAge
  delete rest.expires
  return rest as T
}
