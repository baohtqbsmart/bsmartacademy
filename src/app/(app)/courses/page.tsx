import { BookOpenIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { COURSE_STATUS } from "@/config/labels"
import { coursePath, routes } from "@/config/routes"
import { COURSE_STATUSES } from "@/features/courses/schemas"
import { listCourses } from "@/features/courses/server/course-service"
import { listSubjectOptions } from "@/features/subjects/server/subject-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Courses") }
}

export default async function CoursesPage({ searchParams }: PageProps<"/courses">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.courses)
  const canWrite = can(user.permissions, "courses.write")
  const params = await searchParams
  const filters = {
    q: firstParam(params, "q"),
    status: enumParam(params, "status", COURSE_STATUSES),
    subject: uuidParam(params, "subject"),
    show: canWrite ? enumParam(params, "show", ["archived"] as const) : undefined,
  }

  const db = await createClient()
  const [courses, subjects] = await Promise.all([
    listCourses(db, { q: filters.q, status: filters.status, subjectId: filters.subject, archived: Boolean(filters.show) }),
    listSubjectOptions(db),
  ])
  const filtered = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title={t("Courses")}
        description={t("Reusable course designs. Every class runs one course.")}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.courseNew}>
                <PlusIcon aria-hidden /> {t("New course")}
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.courses}
        values={filters}
        searchPlaceholder={t("Search courses")}
        filters={[
          {
            param: "subject",
            allLabel: "All subjects",
            options: subjects.map((s) => ({ value: s.id, label: s.name })),
          },
          ...(canWrite
            ? [
                {
                  param: "status",
                  allLabel: "All statuses",
                  options: COURSE_STATUSES.map((s) => ({ value: s, label: COURSE_STATUS[s].label })),
                },
                { param: "show", allLabel: "Live courses", options: [{ value: "archived", label: "Archived" }] },
              ]
            : []),
        ]}
      />
      <SimpleTable
        rows={courses}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={BookOpenIcon}
            title={filtered ? t("No courses match your filters") : t("No courses yet")}
            description={filtered ? t("Try removing some filters.") : undefined}
          />
        }
        columns={[
          { header: "Code", cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
          {
            header: "Course",
            cell: (c) => (
              <Link href={coursePath(c.id)} className="font-medium hover:underline">
                {c.name}
              </Link>
            ),
          },
          { header: "Subject", cell: (c) => c.subject?.name ?? "—" },
          { header: "Level", cell: (c) => c.level?.name ?? "—" },
          {
            header: "Duration",
            cell: (c) =>
              [
                c.duration_weeks && `${c.duration_weeks} weeks`,
                c.session_count && `${c.session_count} × ${c.session_minutes ?? "?"} min`,
              ]
                .filter(Boolean)
                .join(" · ") || "—",
          },
          { header: "Units", cell: (c) => c.unitCount },
          { header: "Classes", cell: (c) => c.currentClassCount },
          {
            header: "Status",
            cell: (c) => <Badge variant={COURSE_STATUS[c.status].variant}>{t(COURSE_STATUS[c.status].label)}</Badge>,
          },
        ]}
      />
    </>
  )
}
