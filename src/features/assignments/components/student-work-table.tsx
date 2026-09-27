import { ClipboardListIcon } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable, type Column } from "@/components/shared/simple-table"
import { assignmentPath } from "@/config/routes"
import { WorkStatusBadge } from "@/features/assignments/components/badges"
import type { StudentAssignmentRow } from "@/features/assignments/server/assignment-service"
import { ASSIGNMENT_TYPE_LABELS, formatScore } from "@/features/assignments/status"
import { formatDateTime } from "@/lib/format"
import { getT } from "@/i18n/server"

/** Released assignments with each student's status and returned grade. */
export async function StudentWorkTable({ rows, showStudent = false }: { rows: StudentAssignmentRow[]; showStudent?: boolean }) {
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
