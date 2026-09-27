import { CalendarCheckIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable, type Column } from "@/components/shared/simple-table"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-badges"
import type { AttendanceHistoryRow } from "@/features/attendance/server/attendance-service"
import { formatDate } from "@/lib/format"

/** Records newest first: date, (student), class, status and the teacher's note. */
export function AttendanceHistory({ rows, showStudent = false }: { rows: AttendanceHistoryRow[]; showStudent?: boolean }) {
  const columns: Column<AttendanceHistoryRow>[] = [
    { header: "Date", cell: (r) => <span className="tabular-nums">{formatDate(r.session_date)}</span> },
    ...(showStudent ? [{ header: "Student", cell: (r: AttendanceHistoryRow) => r.student?.full_name ?? "—" }] : []),
    { header: "Class", cell: (r) => r.class?.name ?? "—" },
    {
      header: "Status",
      cell: (r) => <AttendanceStatusBadge status={r.status} minutesLate={r.minutes_late} online={r.attended_via === "online"} />,
    },
    { header: "Teacher's note", cell: (r) => <span className="whitespace-normal">{r.note ?? "—"}</span> },
  ]
  return (
    <SimpleTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      empty={<EmptyState icon={CalendarCheckIcon} title="No attendance recorded in this period" />}
    />
  )
}
