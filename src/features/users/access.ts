/**
 * UI mirror of private.assert_can_manage_user(): which accounts and roles the
 * current user may manage. Used only to decide which controls to render; the
 * database function is the authority.
 */
type Role = { code: string; name: string; rank: number }

export function assignableRoles(actorRoleCode: string, roles: Role[]) {
  if (actorRoleCode === "super_admin") return roles
  const actorRank = roles.find((role) => role.code === actorRoleCode)?.rank ?? 0
  return roles.filter((role) => role.rank < actorRank)
}

export function canManageUser(
  actor: { id: string; roleCode: string },
  target: { id: string; roleCode: string },
  roles: Role[]
) {
  if (actor.id === target.id) return false
  if (actor.roleCode === "super_admin") return true
  const rank = (code: string) => roles.find((role) => role.code === code)?.rank
  const actorRank = rank(actor.roleCode)
  const targetRank = rank(target.roleCode)
  return actorRank !== undefined && targetRank !== undefined && targetRank < actorRank
}
