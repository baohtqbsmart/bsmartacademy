import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

export async function listUsers(db: DbClient) {
  const { data, error } = await db
    .from("profiles")
    .select("id, email, full_name, role_code, is_active, created_at")
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listRoles(db: DbClient) {
  const { data, error } = await db
    .from("roles")
    .select("code, name, rank")
    .order("rank", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data
}

// Rank rules (who may manage whom) are enforced inside these SQL functions.
export async function setUserRole(db: DbClient, userId: string, roleCode: string) {
  const { error } = await db.rpc("set_user_role", { target_user_id: userId, new_role_code: roleCode })
  if (error) throw fromPostgrestError(error)
}

export async function setUserActive(db: DbClient, userId: string, active: boolean) {
  const { error } = await db.rpc("set_user_active", { target_user_id: userId, active })
  if (error) throw fromPostgrestError(error)
}

/** Individual grants, by user id (scope "all"). */
export async function listUserGrants(db: DbClient) {
  const { data, error } = await db.from("user_permissions").select("profile_id, permission_code, scope")
  if (error) throw fromPostgrestError(error)
  const byUser: Record<string, string[]> = {}
  for (const grant of data) {
    if (grant.scope === "all") (byUser[grant.profile_id] ??= []).push(grant.permission_code)
  }
  return byUser
}

// The database checks that the caller may manage the user and holds the permission.
export async function setUserPermission(db: DbClient, userId: string, permission: string, granted: boolean) {
  const { error } = granted
    ? await db.rpc("grant_user_permission", { target_user_id: userId, target_permission: permission })
    : await db.rpc("revoke_user_permission", { target_user_id: userId, target_permission: permission })
  if (error) throw fromPostgrestError(error)
}

export async function listPermissionDescriptions(db: DbClient) {
  const { data, error } = await db.from("permissions").select("code, description").order("code")
  if (error) throw fromPostgrestError(error)
  return data
}
