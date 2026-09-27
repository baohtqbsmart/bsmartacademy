import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { classAttendancePath, studentPath } from "@/config/routes"
import { AbsenceAlertBadge } from "@/features/attendance/components/attendance-badges"
import type { AbsenceAlert } from "@/features/attendance/server/attendance-service"
import { ABSENCE_RULES, ABSENCE_WINDOW_DAYS, describeAlert } from "@/features/attendance/summary"
import { formatDate } from "@/lib/format"

export const ALERT_RULE_TEXT =
  `Watch: ${ABSENCE_RULES.warning.consecutive} absences in a row or ${ABSENCE_RULES.warning.recent} in ${ABSENCE_WINDOW_DAYS} days. ` +
  `Needs follow-up: ${ABSENCE_RULES.serious.consecutive} in a row or ${ABSENCE_RULES.serious.recent} in ${ABSENCE_WINDOW_DAYS} days. ` +
  "Excused absences do not count."

/** Repeated-absence warnings for the students the caller can see. */
export function AbsenceAlerts({
  alerts,
  title = "Repeated absences",
  showClass = true,
  linkStudents = true,
  linkClasses = false,
}: {
  alerts: AbsenceAlert[]
  title?: string
  showClass?: boolean
  linkStudents?: boolean
  /** Link class names to their register (for those who take attendance). */
  linkClasses?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{ALERT_RULE_TEXT}</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No repeated absences in active classes.</p>
        ) : (
          <ul className="grid gap-3">
            {alerts.map((alert) => (
              <li key={`${alert.student_id}-${alert.class_id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="grid">
                  <span className="font-medium">
                    {linkStudents ? (
                      <Link href={studentPath(alert.student_id, "attendance")} className="hover:underline">
                        {alert.student_name}
                      </Link>
                    ) : (
                      alert.student_name
                    )}
                    {showClass && (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {linkClasses ? (
                          <Link href={classAttendancePath(alert.class_id)} className="hover:underline">
                            {alert.class_name}
                          </Link>
                        ) : (
                          alert.class_name
                        )}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {describeAlert(alert)}
                    {alert.last_absent_on && ` · last absent ${formatDate(alert.last_absent_on)}`}
                  </span>
                </div>
                <AbsenceAlertBadge level={alert.level} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
