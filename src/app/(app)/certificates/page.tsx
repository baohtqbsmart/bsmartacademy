import { AwardIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { certificatePath, routes } from "@/config/routes"
import { listCertificates } from "@/features/certificates/server/certificate-service"
import { getT } from "@/i18n/server"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Certificates") }
}

export default async function CertificatesPage() {
  const t = await getT()
  const user = await requireRouteAccess(routes.certificates)
  const certificates = await listCertificates(await createClient())
  const staff = can(user.permissions, "students.read", ["all", "assigned"])

  return (
    <>
      <PageHeader
        title={t("Certificates")}
        description={
          can(user.permissions, "certificates.write")
            ? t("Certificates of completion. Issue them from a class page.")
            : staff
              ? t("Certificates of the students you teach.")
              : t("Certificates of completion you can print or share.")
        }
      />
      <SimpleTable
        rows={certificates}
        rowKey={(c) => c.id}
        empty={<EmptyState icon={AwardIcon} title={t("No certificates yet")} description={t("Certificates appear here when a course is completed.")} />}
        columns={[
          {
            header: "Course",
            cell: (c) => (
              <div className="grid">
                <Link href={certificatePath(c.id)} className="font-medium hover:underline">
                  {c.course_name}
                </Link>
                <span className="text-muted-foreground text-xs">{c.class_name}</span>
              </div>
            ),
          },
          { header: "Student", cell: (c) => c.student_name },
          {
            header: "Number",
            cell: (c) => <span className="font-mono text-xs">{c.certificate_no}</span>,
          },
          {
            header: "Issued",
            cell: (c) => <span className="tabular-nums">{formatDate(c.issued_on)}</span>,
          },
          {
            header: "Status",
            cell: (c) => (c.revoked_at ? <Badge variant="destructive">{t("Revoked")}</Badge> : <Badge>{t("Valid")}</Badge>),
          },
        ]}
      />
    </>
  )
}
