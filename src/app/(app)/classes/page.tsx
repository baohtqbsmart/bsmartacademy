import { PlusIcon, PresentationIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CLASS_STATUS, DELIVERY_MODE_LABELS } from "@/config/labels"
import { classPath, routes } from "@/config/routes"
import { CLASS_STATUSES } from "@/features/classes/schemas"
import { listClasses, type ClassStatusFilter } from "@/features/classes/server/class-service"
import { listCourses } from "@/features/courses/server/course-service"
import { listAssignableTeachers } from "@/features/teachers/server/teacher-service"
import { WeeklySlots } from "@/features/timetable/components/weekly-slots"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateRange } from "@/lib/format"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Classes" }

const STATUS_FILTERS = ["current", "all", ...CLASS_STATUSES] as const

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const user = await requireRouteAccess(routes.classes)
  const canWrite = can(user.permissions, "classes.write")
  const seesAll = can(user.permissions, "classes.read", ["all"])
  const params = await searchParams
  const filters = {
    q: firstParam(params, "q"),
    status: enumParam(params, "status", STATUS_FILTERS),
    course: uuidParam(params, "course"),
    teacher: seesAll ? uuidParam(params, "teacher") : undefined,
    show: canWrite ? enumParam(params, "show", ["archived"] as const) : undefined,
  }

  const db = await createClient()
  const [classes, courses, teachers] = await Promise.all([
    listClasses(db, {
      q: filters.q,
      status: (filters.status ?? "current") as ClassStatusFilter,
      courseId: filters.course,
      teacherId: filters.teacher,
      archived: Boolean(filters.show),
    }),
    listCourses(db),
    seesAll ? listAssignableTeachers(db) : [],
  ])
  const filtered = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader
        title="Classes"
        description={seesAll ? "All classes at the academy." : "Classes you have access to."}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.classNew}>
                <PlusIcon aria-hidden /> New class
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.classes}
        values={filters}
        searchPlaceholder="Search classes"
        filters={[
          {
            param: "status",
            allLabel: "Status",
            defaultValue: "current",
            options: [
              { value: "current", label: "Planned & running" },
              { value: "all", label: "All statuses" },
              ...CLASS_STATUSES.map((s) => ({ value: s, label: CLASS_STATUS[s].label })),
            ],
          },
          { param: "course", allLabel: "All courses", options: courses.map((c) => ({ value: c.id, label: c.name })) },
          ...(seesAll
            ? [{ param: "teacher", allLabel: "All teachers", options: teachers.map((t) => ({ value: t.id, label: t.full_name })) }]
            : []),
          ...(canWrite
            ? [{ param: "show", allLabel: "Live classes", options: [{ value: "archived", label: "Archived" }] }]
            : []),
        ]}
      />
      <SimpleTable
        rows={classes}
        rowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={PresentationIcon}
            title={filtered ? "No classes match your filters" : "No planned or running classes"}
            description={filtered ? "Try removing some filters." : undefined}
          />
        }
        columns={[
          {
            header: "Class",
            cell: (c) => (
              <div className="grid">
                <Link href={classPath(c.id)} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="text-muted-foreground font-mono text-xs">{c.code}</span>
              </div>
            ),
          },
          {
            header: "Course",
            cell: (c) => (
              <div className="grid text-sm">
                <span>{c.course?.name ?? "—"}</span>
                <span className="text-muted-foreground text-xs">
                  {[c.course?.subject?.name, c.course?.level?.name].filter(Boolean).join(" · ")}
                </span>
              </div>
            ),
          },
          {
            header: "Teacher",
            cell: (c) =>
              c.class_members.find((m) => m.member_role === "lead_teacher")?.teacher?.full_name ?? "—",
          },
          {
            header: "Students",
            cell: (c) => (c.capacity ? `${c.studentCount} / ${c.capacity}` : c.studentCount),
          },
          { header: "Schedule", cell: (c) => <WeeklySlots slots={c.class_schedule_slots} empty="—" /> },
          {
            header: "Where",
            cell: (c) => (c.delivery_mode === "online" ? "Online" : [c.room, c.delivery_mode === "hybrid" && DELIVERY_MODE_LABELS.hybrid].filter(Boolean).join(" · ") || "—"),
          },
          { header: "Dates", cell: (c) => formatDateRange(c.start_date, c.end_date) },
          {
            header: "Status",
            cell: (c) => <Badge variant={CLASS_STATUS[c.status].variant}>{CLASS_STATUS[c.status].label}</Badge>,
          },
        ]}
      />
    </>
  )
}
