import "server-only"

import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { canAccessRoute, type ProtectedRoute } from "@/config/access"
import { routes } from "@/config/routes"
import {
  can,
  toGrants,
  type Permission,
  type PermissionGrants,
  type PermissionScope,
} from "@/lib/auth/permissions"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"

export type CurrentUser = {
  id: string
  email: string
  fullName: string
  phone: string | null
  avatarPath: string | null
  roleCode: string
  permissions: PermissionGrants
}

type SessionState =
  | { status: "anonymous" }
  | { status: "inactive" }
  | { status: "active"; user: CurrentUser }

/**
 * Resolves the verified session, profile and effective permissions once per
 * request (React `cache` dedupes calls across layouts, pages and actions).
 */
const getSession = cache(async (): Promise<SessionState> => {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claimsData) return { status: "anonymous" }

  const [profileResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, avatar_path, role_code, is_active")
      .eq("id", claimsData.claims.sub)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ])

  if (profileResult.error) throw fromPostgrestError(profileResult.error)
  if (permissionsResult.error) throw fromPostgrestError(permissionsResult.error)

  const profile = profileResult.data
  if (!profile || !profile.is_active) return { status: "inactive" }

  return {
    status: "active",
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      avatarPath: profile.avatar_path,
      roleCode: profile.role_code,
      permissions: toGrants(permissionsResult.data),
    },
  }
})

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession()
  return session.status === "active" ? session.user : null
}

/** For pages/layouts/actions: redirects to sign-in when there is no active user. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession()
  if (session.status === "active") return session.user
  if (session.status === "inactive") redirect(`${routes.signOut}?reason=inactive`)
  redirect(routes.login)
}

/**
 * For Server Actions and services. Throws FORBIDDEN, which runAction turns into
 * a typed error. The database enforces the same rule through RLS.
 */
export async function requirePermission(
  permission: Permission,
  scopes?: readonly PermissionScope[]
): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user.permissions, permission, scopes)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do this.")
  }
  return user
}

/**
 * For pages: renders 404 when the user may not open `route`, so direct URL
 * access neither works nor reveals that the page exists.
 */
export async function requireRouteAccess(route: ProtectedRoute): Promise<CurrentUser> {
  const user = await requireUser()
  if (!canAccessRoute(user.permissions, route)) notFound()
  return user
}
