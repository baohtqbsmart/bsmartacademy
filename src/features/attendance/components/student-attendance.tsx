import { StatTiles } from "@/components/shared/stat-tiles"
import { AbsenceAlerts } from "@/features/attendance/components/absence-alerts"
import { AttendanceHistory } from "@/features/attendance/components/attendance-history"
import type { AbsenceAlert, AttendanceHistoryRow } from "@/features/attendance/server/attendance-service"
import { attendanceRate, emptyCounts } from "@/features/attendance/summary"
import { getT } from "@/i18n/server"

export const STUDENT_ATTENDANCE_DAYS = 90

/** Student profile tab: the last 90 days of attendance and any warnings. */
export async function StudentAttendance({
  history,
  alerts,
  onlyTaughtClasses,
}: {
  history: AttendanceHistoryRow[]
  alerts: AbsenceAlert[]
  /** Teachers see the classes they teach only; say so. */
  onlyTaughtClasses: boolean
}) {
  const t = await getT()
  const counts = emptyCounts()
  for (const row of history) counts[row.status] += 1

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        {t("Last {STUDENT_ATTENDANCE_DAYS} days", { STUDENT_ATTENDANCE_DAYS })}{onlyTaughtClasses && t(", in the classes you teach")}.
      </p>
      <StatTiles
        tiles={[
          { label: "Attendance rate", value: attendanceRate(counts), kind: "percent", hint: "Present or late; excused not counted" },
          { label: "Present", value: counts.present, kind: "count" },
          { label: "Late", value: counts.late, kind: "count" },
          { label: "Absent", value: counts.absent, kind: "count", tone: "critical" },
          { label: "Excused", value: counts.excused, kind: "count" },
        ]}
      />
      {alerts.length > 0 && <AbsenceAlerts alerts={alerts} title={t("Absence warnings")} linkStudents={false} />}
      <AttendanceHistory rows={history} />
    </div>
  )
}
