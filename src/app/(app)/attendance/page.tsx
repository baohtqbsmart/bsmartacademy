import { CalendarCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { StatTiles } from "@/components/shared/stat-tiles"
import { TabNav } from "@/components/shared/tab-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { classAttendancePath, routes, studentPath, teacherPath } from "@/config/routes"
import { AbsenceAlerts } from "@/features/attendance/components/absence-alerts"
import { AttendanceHistory } from "@/features/attendance/components/attendance-history"
import { AttendanceTrendChart } from "@/features/attendance/components/attendance-trend-chart"
import {
  listAttendanceHistory,
  listRegisterClasses,
  listReportFilterOptions,
  loadAbsenceAlerts,
  loadAttendanceReport,
  type ReportFilters,
  type ReportGrouping,
  type ReportRow,
} from "@/features/attendance/server/attendance-service"
import { formatRate, parseDateRange } from "@/features/attendance/summary"
import { can } from "@/lib/auth/permissions"
import type { CurrentUser } from "@/lib/auth/session"
import { requireRouteAccess } from "@/lib/auth/session"
import { isoWeekday, todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { enumParam, firstParam, uuidParam, withParams, type RawSearchParams } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import type { DbClient } from "@/lib/supabase/types"

export const metadata: Metadata = { title: "Attendance" }

const GROUPINGS = ["student", "class", "teacher"] as const
const GROUPING_LABELS: Record<ReportGrouping, string> = { student: "By student", class: "By class", teacher: "By teacher" }

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const user = await requireRouteAccess(routes.attendance)
  const params = await searchParams
  const today = todayInAcademy()
  const range = parseDateRange(firstParam(params, "from"), firstParam(params, "to"), today)
  const db = await createClient()

  // Academy staff and teachers get reports; students and parents their history.
  return can(user.permissions, "attendance.read", ["all", "assigned"]) ? (
    <StaffAttendance user={user} db={db} params={params} range={range} today={today} />
  ) : (
    <FamilyAttendance user={user} db={db} range={range} today={today} />
  )
}

type ViewProps = {
  user: CurrentUser
  db: DbClient
  range: { from: string; to: string; isDefault: boolean }
  today: string
}

async function StaffAttendance({ user, db, params, range, today }: ViewProps & { params: RawSearchParams }) {
  const academyWide = can(user.permissions, "attendance.read", ["all"])
  const canTake = can(user.permissions, "attendance.write")
  const groupings = academyWide ? GROUPINGS : GROUPINGS.filter((g) => g !== "teacher")
  const by = enumParam(params, "by", groupings) ?? "student"
  const classId = uuidParam(params, "class")
  const teacherId = academyWide ? uuidParam(params, "teacher") : undefined
  const filters: ReportFilters = { from: range.from, to: range.to, classId, teacherId }

  const [report, alerts, options, registerClasses] = await Promise.all([
    loadAttendanceReport(db, filters, by),
    loadAbsenceAlerts(db, { classId }),
    listReportFilterOptions(db, academyWide),
    canTake ? listRegisterClasses(db) : [],
  ])
  const teacherClassIds = teacherId
    ? new Set(options.classes.filter((c) => c.class_members.some((m) => m.teacher_id === teacherId)).map((c) => c.id))
    : null
  const shownAlerts = teacherClassIds ? alerts.filter((a) => teacherClassIds.has(a.class_id)) : alerts
  const { totals } = report

  const query = {
    from: range.isDefault ? undefined : range.from,
    to: range.isDefault ? undefined : range.to,
    class: classId,
    teacher: teacherId,
  }
  const rows = by === "student" ? [...report.rows].sort(byRateAscending) : report.rows

  return (
    <>
      <PageHeader
        title="Attendance"
        description={academyWide ? "Attendance across the academy." : "Attendance in the classes you teach."}
      />

      {registerClasses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Take attendance</CardTitle>
            <CardDescription>Open a class register; classes meeting today are listed first.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...registerClasses]
              .sort((a, b) => Number(meetsOn(b, today)) - Number(meetsOn(a, today)))
              .map((c) => (
                <Button key={c.id} variant={meetsOn(c, today) ? "default" : "outline"} size="sm" asChild>
                  <Link href={classAttendancePath(c.id)}>
                    {c.name}
                    {meetsOn(c, today) && " · today"}
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFilter
          basePath={routes.attendance}
          from={range.from}
          to={range.to}
          max={today}
          preserve={{ by: by === "student" ? undefined : by, class: classId, teacher: teacherId }}
        />
        <ListFilters
          basePath={routes.attendance}
          values={{ class: classId, teacher: teacherId }}
          preserve={{ from: query.from, to: query.to, by: by === "student" ? undefined : by }}
          filters={[
            { param: "class", allLabel: "All classes", options: options.classes.map((c) => ({ value: c.id, label: c.name })) },
            ...(academyWide
              ? [{ param: "teacher", allLabel: "All teachers", options: options.teachers.map((t) => ({ value: t.id, label: t.full_name })) }]
              : []),
          ]}
        />
      </div>

      <StatTiles
        tiles={[
          { label: "Attendance rate", value: totals.rate, kind: "percent", hint: "Present or late; excused not counted" },
          { label: "Registers taken", value: totals.sessions, kind: "count", hint: `${formatDate(range.from)} – ${formatDate(range.to)}` },
          { label: "Absences", value: totals.absent, kind: "count", tone: "critical", hint: `${totals.excused} excused` },
          { label: "Late arrivals", value: totals.late, kind: "count" },
          {
            label: "Students to follow up",
            value: shownAlerts.length,
            kind: "count",
            tone: "critical",
            hint: "Repeated absences (see below)",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Attendance rate by week</CardTitle>
            <CardDescription>Share of students present or late, per week (Monday to Sunday).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <AttendanceTrendChart data={report.weekly} />
            <details>
              <summary className="text-muted-foreground cursor-pointer text-sm">Show as table</summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-1 font-normal">Week of</th>
                      <th className="py-1 text-right font-normal">Present</th>
                      <th className="py-1 text-right font-normal">Late</th>
                      <th className="py-1 text-right font-normal">Absent</th>
                      <th className="py-1 text-right font-normal">Excused</th>
                      <th className="py-1 text-right font-normal">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {report.weekly.map((w) => (
                      <tr key={w.week} className="border-t">
                        <td className="py-1">{formatDate(w.week)}</td>
                        <td className="py-1 text-right">{w.present}</td>
                        <td className="py-1 text-right">{w.late}</td>
                        <td className="py-1 text-right">{w.absent}</td>
                        <td className="py-1 text-right">{w.excused}</td>
                        <td className="py-1 text-right">{w.rate === null ? "—" : `${w.rate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardContent>
        </Card>
        <AbsenceAlerts alerts={shownAlerts} linkClasses={canTake} />
      </div>

      <section className="grid gap-3">
        <h2 className="font-semibold">Report</h2>
        <TabNav
          label="Group the report"
          active={by}
          tabs={groupings.map((g) => ({
            value: g,
            label: GROUPING_LABELS[g],
            href: withParams(routes.attendance, { ...query, by: g === "student" ? undefined : g }),
          }))}
        />
        <ReportTable rows={rows} by={by} canTake={canTake} />
      </section>
    </>
  )
}

function ReportTable({ rows, by, canTake }: { rows: ReportRow[]; by: ReportGrouping; canTake: boolean }) {
  const href = (row: ReportRow) => {
    if (by === "student") return studentPath(row.id, "attendance")
    if (by === "class") return canTake ? classAttendancePath(row.id) : `${routes.attendance}?class=${row.id}`
    return teacherPath(row.id)
  }
  const n = (value: number) => <span className="tabular-nums">{value}</span>
  return (
    <SimpleTable
      rows={rows}
      rowKey={(r) => r.id}
      empty={<EmptyState icon={CalendarCheckIcon} title="No attendance recorded for these filters" />}
      footer={by === "student" && rows.length > 0 && <p className="text-muted-foreground text-sm">Lowest attendance first.</p>}
      columns={[
        {
          header: { student: "Student", class: "Class", teacher: "Teacher" }[by],
          key: "name",
          cell: (r) => (
            <div className="grid">
              <Link href={href(r)} className="font-medium hover:underline">
                {r.label}
              </Link>
              <span className="text-muted-foreground font-mono text-xs">{r.code}</span>
            </div>
          ),
        },
        { header: "Registers", cell: (r) => n(r.sessions) },
        { header: "Present", cell: (r) => n(r.present) },
        { header: "Late", cell: (r) => n(r.late) },
        { header: "Absent", cell: (r) => n(r.absent) },
        { header: "Excused", cell: (r) => n(r.excused) },
        { header: "Rate", cell: (r) => <span className="font-medium tabular-nums">{formatRate(r.rate)}</span> },
      ]}
    />
  )
}

async function FamilyAttendance({ user, db, range, today }: ViewProps) {
  const isParent = can(user.permissions, "attendance.read", ["children"])
  const filters = { from: range.from, to: range.to }
  const [report, alerts, history] = await Promise.all([
    loadAttendanceReport(db, filters, "student"),
    loadAbsenceAlerts(db),
    listAttendanceHistory(db, filters),
  ])

  return (
    <>
      <PageHeader
        title="Attendance"
        description={isParent ? "Your children's attendance in class." : "Your attendance in class."}
      />
      <DateRangeFilter basePath={routes.attendance} from={range.from} to={range.to} max={today} />
      {isParent ? (
        <ReportTable rows={report.rows} by="student" canTake={false} />
      ) : (
        <StatTiles
          tiles={[
            { label: "Attendance rate", value: report.totals.rate, kind: "percent", hint: "Present or late; excused not counted" },
            { label: "Present", value: report.totals.present, kind: "count" },
            { label: "Late", value: report.totals.late, kind: "count" },
            { label: "Absent", value: report.totals.absent, kind: "count", tone: "critical" },
            { label: "Excused", value: report.totals.excused, kind: "count" },
          ]}
        />
      )}
      {alerts.length > 0 && <AbsenceAlerts alerts={alerts} title="Absence warnings" />}
      <section className="grid gap-2">
        <h2 className="font-semibold">History</h2>
        <AttendanceHistory rows={history} showStudent={isParent} />
      </section>
    </>
  )
}

function byRateAscending(a: ReportRow, b: ReportRow) {
  return (a.rate ?? 2) - (b.rate ?? 2) || a.label.localeCompare(b.label, "vi")
}

function meetsOn(klass: { class_schedule_slots: { weekday: number }[] }, date: string) {
  return klass.class_schedule_slots.some((slot) => slot.weekday === isoWeekday(date))
}
