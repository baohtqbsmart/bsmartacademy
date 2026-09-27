import { ArrowRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { reportPath, routes } from "@/config/routes"
import { DistributionChart } from "@/features/analytics/components/progress-charts"
import { MIN_GROUP } from "@/features/analytics/metrics"
import { AttendanceTrendChart } from "@/features/attendance/components/attendance-trend-chart"
import { loadDashboard } from "@/features/reports/server/dashboard-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Admin dashboard" }

const n = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN")
const rate = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

export default async function AdminDashboardPage() {
  const user = await requireRouteAccess(routes.adminDashboard)
  // Financial figures only for accounts that may see all tuition.
  const withTuition = can(user.permissions, "tuition.read", ["all"])
  const d = await loadDashboard(await createClient(), { withTuition })
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHeader title="Admin dashboard" description={`Live figures from the academy's records · attendance and homework: last 30 days (${formatDate(d.month.from)} – ${formatDate(d.month.to)})`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Students" value={n(d.students.active)} caption="active" href={reportPath("students")}>
          {n(d.students.on_hold)} on hold · {n(d.students.graduated)} graduated · {n(d.students.withdrawn)} withdrawn
          <br />
          {n(d.newEnrolments)} new enrolments in 30 days
        </SummaryCard>
        <SummaryCard title="Teachers" value={n(d.teachers.active)} caption="active" href={reportPath("teachers")}>
          {n(d.teachers.on_leave)} on leave · {n(d.teachers.inactive)} inactive
        </SummaryCard>
        <SummaryCard title="Classes" value={n(d.classes.active)} caption="running" href={reportPath("classes")}>
          {n(d.classes.planned)} planned · {n(d.classes.completed)} completed · {n(d.classes.cancelled)} cancelled
        </SummaryCard>
        <SummaryCard title="Courses" value={n(d.courses.active)} caption="active" href={routes.courses}>
          {n(d.courses.draft)} draft · {n(d.courses.inactive)} inactive · {n(sum(d.courses))} in total
        </SummaryCard>
        <SummaryCard title="Attendance" value={rate(d.attendance.rate)} caption="attended" href={reportPath("attendance")}>
          {n(d.attendance.present)} present · {n(d.attendance.late)} late · {n(d.attendance.absent)} absent · {n(d.attendance.excused)} excused
        </SummaryCard>
        <SummaryCard title="Assignments" value={n(d.assignments.published)} caption="published in 30 days" href={reportPath("assignments")}>
          {n(d.assignments.awaitingMarking)} handed in and awaiting marking
          <br />
          Homework handed in: {rate(d.assignments.homework.completionRate)} of {n(d.assignments.homework.due)} due ({n(d.assignments.homework.missing)} missing)
        </SummaryCard>
        <SummaryCard
          title="Academic performance"
          value={d.performance.suppressed ? "—" : `${d.performance.averageOfStudents}%`}
          caption="average of students"
          href={reportPath("progress")}
        >
          {d.performance.suppressed
            ? `Withheld: fewer than ${MIN_GROUP} students with published results in 90 days.`
            : `${n(d.performance.studentsWithResults)} students with published results in the last 90 days; each student's own average first.`}
        </SummaryCard>
        {d.tuition && (
          <SummaryCard title="Tuition" value={formatVnd(d.tuition.outstanding)} caption="outstanding" href={reportPath("tuition")}>
            {n(d.tuition.openInvoices)} open invoices · {n(d.tuition.overdueCount)} overdue ({formatVnd(d.tuition.overdueAmount)})
            <br />
            Collected this month: {formatVnd(d.tuition.collectedThisMonth)}
          </SummaryCard>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance rate by week</CardTitle>
            <CardDescription>Last 12 weeks · (present + late) ÷ (present + late + absent)</CardDescription>
          </CardHeader>
          <CardContent>
            {d.trend.some((w) => w.rate !== null) ? <AttendanceTrendChart data={d.trend} /> : <p className="text-muted-foreground py-10 text-center text-sm">No registers taken yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spread of student averages</CardTitle>
            <CardDescription>Students per range of their own average · last 90 days, published results only</CardDescription>
          </CardHeader>
          <CardContent>
            {d.performance.suppressed ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Withheld: fewer than {MIN_GROUP} students have results.</p>
            ) : (
              <DistributionChart data={d.performance.distribution} />
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground text-xs">
        Figures are calculated from the database each time the page opens. Open a report for details, filters, printing and CSV export.
      </p>
    </>
  )
}

function SummaryCard({ title, value, caption, href, children }: { title: string; value: string; caption: string; href: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          {title}
          <Link href={href} className="text-muted-foreground hover:text-foreground" aria-label={`${title} report`}>
            <ArrowRightIcon className="size-4" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 px-4">
        <span className="text-2xl font-semibold tabular-nums">
          {value} <span className="text-muted-foreground text-sm font-normal">{caption}</span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{children}</span>
      </CardContent>
    </Card>
  )
}
