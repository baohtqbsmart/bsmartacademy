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
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Admin dashboard") }
}

const n = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN")
const rate = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

export default async function AdminDashboardPage() {
  const t = await getT()
  const user = await requireRouteAccess(routes.adminDashboard)
  // Financial figures only for accounts that may see all tuition.
  const withTuition = can(user.permissions, "tuition.read", ["all"])
  const d = await loadDashboard(await createClient(), { withTuition })
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHeader title={t("Admin dashboard")} description={t("Live figures from the academy's records · attendance and homework: last 30 days ({date} – {date2})", { date: formatDate(d.month.from), date2: formatDate(d.month.to) })} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title={t("Students")} value={n(d.students.active)} caption={t("active")} href={reportPath("students")}>
          {t("{n} on hold · {n2} graduated · {n3} withdrawn", { n: n(d.students.on_hold), n2: n(d.students.graduated), n3: n(d.students.withdrawn) })}
          <br />
          {t("{n} new enrolments in 30 days", { n: n(d.newEnrolments) })}
        </SummaryCard>
        <SummaryCard title={t("Teachers")} value={n(d.teachers.active)} caption={t("active")} href={reportPath("teachers")}>
          {t("{n} on leave · {n2} inactive", { n: n(d.teachers.on_leave), n2: n(d.teachers.inactive) })}
        </SummaryCard>
        <SummaryCard title={t("Classes")} value={n(d.classes.active)} caption={t("running")} href={reportPath("classes")}>
          {t("{n} planned · {n2} completed · {n3} cancelled", { n: n(d.classes.planned), n2: n(d.classes.completed), n3: n(d.classes.cancelled) })}
        </SummaryCard>
        <SummaryCard title={t("Courses")} value={n(d.courses.active)} caption={t("active")} href={routes.courses}>
          {t("{n} draft · {n2} inactive · {n3} in total", { n: n(d.courses.draft), n2: n(d.courses.inactive), n3: n(sum(d.courses)) })}
        </SummaryCard>
        <SummaryCard title={t("Attendance")} value={rate(d.attendance.rate)} caption={t("attended")} href={reportPath("attendance")}>
          {t("{n} present · {n2} late · {n3} absent · {n4} excused", { n: n(d.attendance.present), n2: n(d.attendance.late), n3: n(d.attendance.absent), n4: n(d.attendance.excused) })}
        </SummaryCard>
        <SummaryCard title={t("Assignments")} value={n(d.assignments.published)} caption={t("published in 30 days")} href={reportPath("assignments")}>
          {t("{n} handed in and awaiting marking", { n: n(d.assignments.awaitingMarking) })}
          <br />
          {t("Homework handed in: {rate} of {n} due ({n2} missing)", { rate: rate(d.assignments.homework.completionRate), n: n(d.assignments.homework.due), n2: n(d.assignments.homework.missing) })}
        </SummaryCard>
        <SummaryCard
          title={t("Academic performance")}
          value={d.performance.suppressed ? "—" : `${d.performance.averageOfStudents}%`}
          caption={t("average of students")}
          href={reportPath("progress")}
        >
          {d.performance.suppressed
            ? t("Withheld: fewer than {MIN_GROUP} students with published results in 90 days.", { MIN_GROUP })
            : t("{n} students with published results in the last 90 days; each student's own average first.", { n: n(d.performance.studentsWithResults) })}
        </SummaryCard>
        {d.tuition && (
          <SummaryCard title={t("Tuition")} value={formatVnd(d.tuition.outstanding)} caption={t("outstanding")} href={reportPath("tuition")}>
            {t("{n} open invoices · {n2} overdue ({vnd})", { n: n(d.tuition.openInvoices), n2: n(d.tuition.overdueCount), vnd: formatVnd(d.tuition.overdueAmount) })}
            <br />
            {t("Collected this month: {vnd}", { vnd: formatVnd(d.tuition.collectedThisMonth) })}
          </SummaryCard>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Attendance rate by week")}</CardTitle>
            <CardDescription>{t("Last 12 weeks · (present + late) ÷ (present + late + absent)")}</CardDescription>
          </CardHeader>
          <CardContent>
            {d.trend.some((w) => w.rate !== null) ? <AttendanceTrendChart data={d.trend} /> : <p className="text-muted-foreground py-10 text-center text-sm">{t("No registers taken yet.")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Spread of student averages")}</CardTitle>
            <CardDescription>{t("Students per range of their own average · last 90 days, published results only")}</CardDescription>
          </CardHeader>
          <CardContent>
            {d.performance.suppressed ? (
              <p className="text-muted-foreground py-10 text-center text-sm">{t("Withheld: fewer than {MIN_GROUP} students have results.", { MIN_GROUP })}</p>
            ) : (
              <DistributionChart data={d.performance.distribution} />
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("Figures are calculated from the database each time the page opens. Open a report for details, filters, printing and CSV export.")}
      </p>
    </>
  )
}

async function SummaryCard({ title, value, caption, href, children }: { title: string; value: string; caption: string; href: string; children: React.ReactNode }) {
  const t = await getT()
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          {title}
          <Link href={href} className="text-muted-foreground hover:text-foreground" aria-label={t("{title} report", { title })}>
            <ArrowRightIcon className="size-4" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 px-4">
        <span className="text-2xl font-semibold tabular-nums">
          {value} <span className="text-muted-foreground text-sm font-normal">{t(caption)}</span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{children}</span>
      </CardContent>
    </Card>
  )
}
