import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { routes } from "@/config/routes"
import { assignableRoles, canManageUser } from "@/features/users/access"
import { UserAccessControls } from "@/features/users/components/user-access-controls"
import { UserGrantsDialog } from "@/features/users/components/user-grants-dialog"
import { listPermissionDescriptions, listRoles, listUserGrants, listUsers } from "@/features/users/server/user-service"
import { can } from "@/lib/auth/permissions"
import { roleLabel } from "@/lib/auth/roles"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Users & roles") }
}

export default async function UsersPage() {
  const t = await getT()
  const user = await requireRouteAccess(routes.users)
  const db = await createClient()
  const [users, roles, grants, permissions] = await Promise.all([
    listUsers(db),
    listRoles(db),
    listUserGrants(db),
    listPermissionDescriptions(db),
  ])
  // Only permissions the current user holds academy-wide can be granted.
  const grantable = permissions.filter((p) =>
    can(user.permissions, p.code as Parameters<typeof can>[1], ["all"])
  )

  const mayManage = can(user.permissions, "users.manage")
  const actor = { id: user.id, roleCode: user.roleCode }
  const offeredRoles = assignableRoles(user.roleCode, roles)

  return (
    <>
      <PageHeader
        title={t("Users & roles")}
        description={t("Accounts are created by invitation. Roles decide what each account can access.")}
      />
      <SimpleTable
        rows={users}
        rowKey={(account) => account.id}
        empty={t("No accounts yet.")}
        columns={[
          {
            header: "Account",
            cell: (u) => (
              <div className="grid">
                <span className="font-medium">{u.full_name || "—"}</span>
                <span className="text-muted-foreground text-xs">{u.email}</span>
              </div>
            ),
          },
          {
            header: "Role",
            cell: (u) => <Badge variant="secondary">{t(roleLabel(u.role_code))}</Badge>,
          },
          {
            header: "Status",
            cell: (u) =>
              u.is_active ? <Badge>{t("Active")}</Badge> : <Badge variant="outline">{t("Deactivated")}</Badge>,
          },
          {
            header: "Manage",
            cell: (u) =>
              mayManage && canManageUser(actor, { id: u.id, roleCode: u.role_code }, roles) ? (
                <div className="flex flex-wrap items-center gap-1">
                  <UserAccessControls
                    userId={u.id}
                    userName={u.full_name || u.email}
                    roleCode={u.role_code}
                    isActive={u.is_active}
                    assignableRoles={offeredRoles.map(({ code, name }) => ({ code, name }))}
                  />
                  <UserGrantsDialog
                    userId={u.id}
                    userName={u.full_name || u.email}
                    grantable={grantable}
                    granted={grants[u.id] ?? []}
                  />
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {u.id === user.id ? t("You") : "—"}
                </span>
              ),
          },
        ]}
      />
    </>
  )
}
