import { ClipboardListIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Button } from "@/components/ui/button"
import { assignmentPath, routes } from "@/config/routes"
import { AssignmentStatusBadge } from "@/features/assignments/components/badges"
import { StudentWorkTable } from "@/features/assignments/components/student-work-table"
import {
  listAssignableClasses,
  listAssignments,
  listStudentAssignments,
} from "@/features/assignments/server/assignment-service"
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  ASSIGNMENT_TYPES,
  type AssignmentStatus,
} from "@/features/assignments/status"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Assignments") }
}

const STATUS_FILTERS = ["current", "draft", "scheduled", "published", "closed", "archived"] as const
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  current: "Not archived",
  ...(ASSIGNMENT_STATUS_LABELS as Record<AssignmentStatus, string>),
}

export default async function AssignmentsPage({ searchParams }: PageProps<"/assignments">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.assignments)
  const db = await createClient()

  // Students and parents: their (children's) work, newest first.
  if (!can(user.permissions, "assignments.read", ["all", "assigned"])) {
    const isParent = can(user.permissions, "assignments.read", ["children"])
    const rows = await listStudentAssignments(db, "family")
    return (
      <>
        <PageHeader
          title={tr("Assignments")}
          description={isParent ? tr("Your children's assignments, what is handed in and returned grades.") : tr("Your assignments and returned grades.")}
        />
        <StudentWorkTable rows={rows} showStudent={isParent} />
      </>
    )
  }

  const params = await searchParams
  const q = firstParam(params, "q")
  const classId = uuidParam(params, "class")
  const status = enumParam(params, "status", STATUS_FILTERS) ?? "current"
  const type = enumParam(params, "type", ASSIGNMENT_TYPES)
  const canWrite = can(user.permissions, "assignments.write")

  const [assignments, classes] = await Promise.all([
    listAssignments(db, { q, classId, status, type }),
    listAssignableClasses(db),
  ])

  return (
    <>
      <PageHeader
        title={tr("Assignments")}
        description={tr("Homework, quizzes and projects set for your classes.")}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={classId ? `${routes.assignmentNew}?class=${classId}` : routes.assignmentNew}>
                <PlusIcon aria-hidden /> {tr("New assignment")}
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.assignments}
        values={{ q, class: classId, status: status === "current" ? undefined : status, type }}
        searchPlaceholder={tr("Search assignments")}
        filters={[
          { param: "class", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) },
          {
            param: "status",
            allLabel: "Status",
            defaultValue: "current",
            options: STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_FILTER_LABELS[s] })),
          },
          { param: "type", allLabel: "All types", options: ASSIGNMENT_TYPES.map((t) => ({ value: t, label: ASSIGNMENT_TYPE_LABELS[t] })) },
        ]}
      />
      <SimpleTable
        rows={assignments}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={ClipboardListIcon} title={tr("No assignments match")} description={canWrite ? tr("Create one with “New assignment”.") : undefined} />}
        columns={[
          {
            header: "Assignment",
            cell: (a) => (
              <div className="grid">
                <Link href={assignmentPath(a.id)} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <span className="text-muted-foreground text-xs">{tr(ASSIGNMENT_TYPE_LABELS[a.assignment_type])}</span>
              </div>
            ),
          },
          { header: "Class", cell: (a) => a.class?.name ?? "—" },
          { header: "Due", cell: (a) => <span className="tabular-nums">{formatDateTime(a.due_at)}</span> },
          {
            header: "Handed in",
            cell: (a) => {
              const latest = latestPerStudent(a.submissions)
              const handedIn = latest.filter((s) => s.status !== "in_progress")
              const toGrade = handedIn.filter((s) => s.status === "submitted").length
              return (
                <span className="tabular-nums">
                  {handedIn.length}
                  {toGrade > 0 && <span className="text-muted-foreground"> {tr("· {toGrade} to grade", { toGrade })}</span>}
                </span>
              )
            },
          },
          { header: "Status", cell: (a) => <AssignmentStatusBadge status={a.state} /> },
        ]}
      />
    </>
  )
}

function latestPerStudent<T extends { student_id: string; attempt: number }>(submissions: T[]) {
  const latest = new Map<string, T>()
  for (const s of submissions) {
    const current = latest.get(s.student_id)
    if (!current || s.attempt > current.attempt) latest.set(s.student_id, s)
  }
  return [...latest.values()]
}
