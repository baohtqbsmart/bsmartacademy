import { ClipboardListIcon } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable, type Column } from "@/components/shared/simple-table"
import { Button } from "@/components/ui/button"
import { assignmentPath, assignmentWorkPath } from "@/config/routes"
import { WorkStatusBadge } from "@/features/assignments/components/badges"
import type { StudentAssignmentRow } from "@/features/assignments/server/assignment-service"
import { ASSIGNMENT_TYPE_LABELS, formatScore } from "@/features/assignments/status"
import { formatDateTime } from "@/lib/format"
import { getT } from "@/i18n/server"

/** Released assignments with each student's status and returned grade. */
const OPEN = new Set(["not_started", "in_progress"])

export async function StudentWorkTable({ rows, showStudent = false, canWork = false }: { rows: StudentAssignmentRow[]; showStudent?: boolean; canWork?: boolean }) {
  const t = await getT()
  const columns: Column<StudentAssignmentRow>[] = [
    {
      header: "Assignment",
      cell: (r) => (
        <div className="grid">
          <Link href={assignmentPath(r.assignment.id)} className="font-medium hover:underline">
            {r.assignment.title}
          </Link>
          <span className="text-muted-foreground text-xs">
            {t(ASSIGNMENT_TYPE_LABELS[r.assignment.assignment_type])} · {r.assignment.class?.name}
          </span>
        </div>
      ),
    },
    ...(showStudent ? [{ header: "Student", cell: (r: StudentAssignmentRow) => r.student.full_name }] : []),
    { header: "Due", cell: (r) => <span className="tabular-nums">{formatDateTime(r.assignment.due_at)}</span> },
    { header: "Status", cell: (r) => <WorkStatusBadge status={r.status} /> },
    {
      header: "Grade",
      cell: (r) => (r.grade ? <span className="tabular-nums">{formatScore(r.grade.score, r.assignment.max_score)}</span> : "—"),
    },
    // Students go straight to their work while it can still be handed in.
    ...(canWork
      ? [
          {
            header: "",
            cell: (r: StudentAssignmentRow) =>
              OPEN.has(r.status) && r.assignment.state === "published" ? (
                <Button asChild size="sm">
                  <Link href={assignmentWorkPath(r.assignment.id)}>{r.status === "in_progress" ? t("Continue working") : t("Start work")}</Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="ghost">
                  <Link href={assignmentPath(r.assignment.id)}>{t("View")}</Link>
                </Button>
              ),
          },
        ]
      : []),
  ]
  return (
    <SimpleTable
      rows={rows}
      rowKey={(r) => r.key}
      columns={columns}
      empty={<EmptyState icon={ClipboardListIcon} title={t("No assignments yet")} />}
    />
  )
}
