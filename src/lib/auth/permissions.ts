import type { Enums } from "@/types/database"

/**
 * Permission codes. The authoritative matrix (which role holds which
 * permission, at which scope) lives in public.role_permissions and is what RLS
 * enforces; tests/db/matrix.test.ts fails if this list drifts from the database.
 */
export const PERMISSIONS = [
  "users.read",
  "users.manage",
  "roles.manage",
  "students.read",
  "students.write",
  "students.delete",
  "parents.read",
  "parents.write",
  "parents.delete",
  "teachers.read",
  "teachers.write",
  "teachers.delete",
  "courses.read",
  "courses.write",
  "courses.delete",
  "classes.read",
  "classes.write",
  "classes.delete",
  "enrollments.read",
  "enrollments.write",
  "enrollments.delete",
  "feedback.read",
  "feedback.write",
  "tuition.read",
  "tuition.write",
  "payments.write",
  "attendance.read",
  "attendance.write",
  "assignments.read",
  "assignments.write",
  "submissions.write",
  "question_bank.read",
  "question_bank.write",
  "tests.read",
  "tests.write",
  "test_attempts.write",
  "english.read",
  "english.write",
  "english.practice",
  "english.results",
  "english.review",
  "assessments.read",
  "assessments.write",
  "assessments.submit",
  "online.read",
  "online.write",
  "designs.read",
  "designs.write",
  "library.read",
  "library.write",
  "analytics.read",
  "announcements.read",
  "announcements.write",
  "messages.read",
  "messages.write",
  "reports.read",
  "ai.use",
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type PermissionScope = Enums<"permission_scope">

/** The signed-in user's effective permissions and the scopes they hold them at. */
export type PermissionGrants = Partial<Record<Permission, PermissionScope[]>>

function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export function toGrants(rows: { permission_code: string; scope: PermissionScope }[]): PermissionGrants {
  const grants: PermissionGrants = {}
  for (const { permission_code, scope } of rows) {
    // Permissions added to the database before the app knows them are ignored.
    if (isPermission(permission_code)) (grants[permission_code] ??= []).push(scope)
  }
  return grants
}

/** True if the user holds `permission` at any of `scopes` (any scope when omitted). */
export function can(
  grants: PermissionGrants,
  permission: Permission,
  scopes?: readonly PermissionScope[]
) {
  const held = grants[permission]
  if (!held?.length) return false
  return !scopes || held.some((scope) => scopes.includes(scope))
}
