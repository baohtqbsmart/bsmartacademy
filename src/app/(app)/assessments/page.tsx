import { HistoryIcon, LibraryIcon, MessageSquareTextIcon, PenLineIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { assessmentPath, routes } from "@/config/routes"
import { listAssessmentClasses, listTasks, type TaskListItem } from "@/features/assessments/server/assessment-service"
import { KIND_LABELS, RESPONSE_LABELS } from "@/features/assessments/scoring"
import { STATUS_LABELS } from "@/features/english/skills"
import { CEFR_LABELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Writing & speaking") }
}

export default async function AssessmentsPage({ searchParams }: PageProps<"/assessments">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.assessments)
  const params = await searchParams
  const db = await createClient()
  const staff = can(user.permissions, "assessments.read", ["all", "assigned"])
  const canWrite = can(user.permissions, "assessments.write")
  const classId = staff ? uuidParam(params, "class") : undefined
  const kind = enumParam(params, "kind", ["writing", "speaking"] as const)
  const archived = staff && enumParam(params, "status", ["archived"] as const) === "archived"

  const [tasks, classes] = await Promise.all([listTasks(db, { classId, kind, archived }), staff ? listAssessmentClasses(db) : []])

  return (
    <>
      <PageHeader
        title={tr("Writing & speaking")}
        description={staff ? tr("Writing and speaking tasks, marked with rubrics and detailed feedback.") : tr("Your writing and speaking tasks and feedback.")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={routes.assessmentHistory}>
                <HistoryIcon aria-hidden /> {tr("History")}
              </Link>
            </Button>
            {canWrite && (
              <>
                <Button variant="outline" asChild>
                  <Link href={routes.assessmentRubrics}>
                    <LibraryIcon aria-hidden /> {tr("Rubrics")}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={routes.feedbackComments}>
                    <MessageSquareTextIcon aria-hidden /> {tr("Comment library")}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={routes.assessmentNew}>
                    <PlusIcon aria-hidden /> {tr("New task")}
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <ListFilters
        basePath={routes.assessments}
        values={{ class: classId, kind, status: archived ? "archived" : undefined }}
        filters={[
          ...(staff ? [{ param: "class", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) }] : []),
          { param: "kind", allLabel: "Writing and speaking", options: [{ value: "writing", label: "Writing" }, { value: "speaking", label: "Speaking" }] },
          ...(staff ? [{ param: "status", allLabel: "Current", options: [{ value: "archived", label: "Archived" }] }] : []),
        ]}
      />
      <SimpleTable
        rows={tasks}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={PenLineIcon} title={tr("No tasks yet")} />}
        columns={[
          {
            header: "Task",
            cell: (t) => (
              <div className="grid">
                <Link href={assessmentPath(t.id)} className="font-medium hover:underline">
                  {t.title}
                </Link>
                <span className="text-muted-foreground text-xs">{tr(RESPONSE_LABELS[t.response_mode])}</span>
              </div>
            ),
          },
          { header: "Kind", cell: (t) => <Badge variant="outline">{tr(KIND_LABELS[t.kind])}</Badge> },
          { header: "Class", cell: (t) => t.class?.name ?? "—" },
          { header: "Level", cell: (t) => (t.cefr_level ? CEFR_LABELS[t.cefr_level] : "—") },
          { header: "Due", cell: (t) => <span className="tabular-nums">{formatDateTime(t.due_at)}</span> },
          staff
            ? { header: "Work", cell: (t: TaskListItem) => <StaffCounts task={t} /> }
            : { header: "Your work", cell: (t: TaskListItem) => <FamilyStatus task={t} /> },
          ...(staff ? [{ header: "Status", cell: (t: TaskListItem) => (t.closed_at ? "Closed" : STATUS_LABELS[t.status]) }] : []),
        ]}
      />
    </>
  )
}

async function StaffCounts({ task }: { task: TaskListItem }) {
  const t = await getT()
  const students = new Set(task.assessment_submissions.map((s) => s.student_id)).size
  const toGrade = task.assessment_submissions.filter((s) => s.status === "submitted").length
  return (
    <span className="tabular-nums">
      {t("{students} handed in", { students })}{toGrade > 0 && <span className="text-muted-foreground"> {t("· {toGrade} to grade", { toGrade })}</span>}
    </span>
  )
}

async function FamilyStatus({ task }: { task: TaskListItem }) {
  const t = await getT()
  if (task.assessment_submissions.length === 0) return <span className="text-muted-foreground">{t("Not handed in")}</span>
  const returned = task.assessment_submissions.some((s) => s.status === "returned")
  return <span>{returned ? t("Feedback ready") : t("Handed in")}</span>
}
