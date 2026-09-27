/** Mirrors public.roles (tests/db/matrix.test.ts keeps them in sync). */
export const ROLE_CODES = ["super_admin", "admin", "teacher", "parent", "student", "member"] as const

export type RoleCode = (typeof ROLE_CODES)[number]

export const ROLE_LABELS: Record<RoleCode, string> = {
  super_admin: "Super administrator",
  admin: "Administrator",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
  member: "Member",
}

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value)
}

export function roleLabel(code: string) {
  return isRoleCode(code) ? ROLE_LABELS[code] : code
}
