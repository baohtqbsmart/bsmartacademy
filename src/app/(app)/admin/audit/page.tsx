import { ScrollTextIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips } from "@/components/shared/filter-chips"
import { SimpleTable } from "@/components/shared/simple-table"
import { routes } from "@/config/routes"
import { AUDIT_GROUPS, listAuditLog, type AuditGroup } from "@/features/audit/server/audit-service"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Audit log") }
}

const GROUPS = Object.keys(AUDIT_GROUPS) as AuditGroup[]
const GROUP_LABELS: Record<AuditGroup, string> = {
  accounts: "Accounts and permissions",
  finance: "Finance",
  content: "Website and content",
  records: "Students, teachers and classes",
}
const ACTION_LABELS: Record<string, string> = {
  "user.role_changed": "Role changed",
  "user.activated": "Account activated",
  "user.deactivated": "Account deactivated",
  "permission.granted": "Permission granted",
  "permission.revoked": "Permission revoked",
  "payment.recorded": "Payment recorded",
  "payment.voided": "Payment voided",
  "invoice.voided": "Invoice voided",
  "content.visibility_changed": "Website visibility changed",
  "article.published": "Article published",
  "article.deleted": "Article deleted",
  "website.settings_changed": "Website settings changed",
  "student.archived": "Student archived",
  "student.restored": "Student restored",
  "teacher.archived": "Teacher archived",
  "teacher.restored": "Teacher restored",
  "class.archived": "Class archived",
  "class.restored": "Class restored",
}

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit">) {
  const t = await getT()
  await requireRouteAccess(routes.audit)
  const group = enumParam(await searchParams, "group", GROUPS)
  const entries = await listAuditLog(await createClient(), { group })

  return (
    <>
      <PageHeader title={t("Audit log")} description={t("Important changes, who made them and when. Entries cannot be edited or deleted.")} />
      <FilterChips
        label={t("Filter")}
        chips={[
          { href: routes.audit, label: t("All"), active: !group },
          ...GROUPS.map((g) => ({ href: `${routes.audit}?group=${g}`, label: t(GROUP_LABELS[g]), active: group === g })),
        ]}
      />
      <SimpleTable
        rows={entries}
        rowKey={(e) => String(e.id)}
        empty={<EmptyState icon={ScrollTextIcon} title={t("Nothing recorded yet")} />}
        columns={[
          { header: "When", cell: (e) => <span className="tabular-nums whitespace-nowrap">{formatDateTime(e.occurred_at)}</span> },
          { header: "Who", cell: (e) => e.actor_name || t("System") },
          { header: "What", cell: (e) => <span className="font-medium">{t(ACTION_LABELS[e.action] ?? e.action)}</span> },
          { header: "Record", cell: (e) => e.summary || "—" },
          {
            header: "Details",
            cell: (e) => {
              const details = e.details && typeof e.details === "object" && !Array.isArray(e.details) ? Object.entries(e.details) : []
              return details.length ? (
                <span className="text-muted-foreground text-xs">
                  {details.map(([key, value]) => `${t(key)}: ${t(String(value))}`).join(" · ")}
                </span>
              ) : (
                "—"
              )
            },
          },
        ]}
      />
      <p className="text-muted-foreground text-xs">{t("Showing the latest 200 entries.")}</p>
    </>
  )
}
