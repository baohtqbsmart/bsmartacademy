import { PlusIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { STAFF_STATUS } from "@/config/labels"
import { routes, teacherPath } from "@/config/routes"
import { listSubjectOptions } from "@/features/subjects/server/subject-service"
import { TEACHER_STATUSES } from "@/features/teachers/schemas"
import { listTeachers } from "@/features/teachers/server/teacher-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Teachers" }

export default async function TeachersPage({ searchParams }: PageProps<"/teachers">) {
  const user = await requireRouteAccess(routes.teachers)
  const canWrite = can(user.permissions, "teachers.write")
  const seesAll = can(user.permissions, "teachers.read", ["all"])
  const params = await searchParams
  const filters = {
    q: firstParam(params, "q"),
    status: enumParam(params, "status", TEACHER_STATUSES),
    subject: uuidParam(params, "subject"),
    show: canWrite ? enumParam(params, "show", ["archived"] as const) : undefined,
  }

  const db = await createClient()
  const [teachers, subjects] = await Promise.all([
    listTeachers(db, { q: filters.q, status: filters.status, subjectId: filters.subject, archived: Boolean(filters.show) }),
    listSubjectOptions(db),
  ])
  const filtered = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Teachers"
        description={seesAll ? "All teaching staff." : "Teachers of your classes."}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.teacherNew}>
                <PlusIcon aria-hidden /> Add teacher
              </Link>
            </Button>
          )
        }
      />
      {seesAll && (
        <ListFilters
          basePath={routes.teachers}
          values={filters}
          searchPlaceholder="Search name, code, email"
          filters={[
            { param: "subject", allLabel: "All subjects", options: subjects.map((s) => ({ value: s.id, label: s.name })) },
            {
              param: "status",
              allLabel: "All statuses",
              options: TEACHER_STATUSES.map((s) => ({ value: s, label: STAFF_STATUS[s].label })),
            },
            ...(canWrite
              ? [{ param: "show", allLabel: "Current staff", options: [{ value: "archived", label: "Archived" }] }]
              : []),
          ]}
        />
      )}
      <SimpleTable
        rows={teachers}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={UsersIcon} title={filtered ? "No teachers match your filters" : "No teachers to show"} />}
        columns={[
          { header: "Code", cell: (t) => <span className="font-mono text-xs">{t.teacher_code}</span> },
          {
            header: "Name",
            cell: (t) => (
              <Link href={teacherPath(t.id)} className="font-medium hover:underline">
                {t.full_name}
              </Link>
            ),
          },
          { header: "Subjects", cell: (t) => t.subjects.join(", ") || "—" },
          { header: "Email", cell: (t) => t.email ?? "—" },
          { header: "Phone", cell: (t) => t.phone ?? "—" },
          { header: "Current classes", cell: (t) => t.currentClassCount },
          {
            header: "Status",
            cell: (t) => <Badge variant={STAFF_STATUS[t.status].variant}>{STAFF_STATUS[t.status].label}</Badge>,
          },
        ]}
      />
    </>
  )
}
