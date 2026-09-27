import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { SimpleTable } from "@/components/shared/simple-table"
import { RELATIONSHIP_LABELS } from "@/config/labels"
import { routes } from "@/config/routes"
import { listParents } from "@/features/parents/server/parent-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Parents") }
}

export default async function ParentsPage() {
  const t = await getT()
  await requireRouteAccess(routes.parents)
  const parents = await listParents(await createClient())

  return (
    <>
      <PageHeader title={t("Parents")} description={t("Parents and guardians with their children.")} />
      <SimpleTable
        rows={parents}
        rowKey={(parent) => parent.id}
        empty={t("No parents to show.")}
        columns={[
          { header: "Name", cell: (p) => <span className="font-medium">{p.full_name}</span> },
          { header: "Phone", cell: (p) => p.phone ?? "—" },
          { header: "Email", cell: (p) => p.email ?? "—" },
          {
            header: "Children",
            cell: (p) => {
              const children = p.student_parents.filter((link) => link.student)
              if (children.length === 0) return "—"
              return (
                <ul className="grid gap-0.5">
                  {children.map((link) => (
                    <li key={link.student!.student_code}>
                      {link.student!.full_name}{" "}
                      <span className="text-muted-foreground">({t(RELATIONSHIP_LABELS[link.relationship])})</span>
                    </li>
                  ))}
                </ul>
              )
            },
          },
        ]}
      />
    </>
  )
}
