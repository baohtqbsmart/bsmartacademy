import { ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analyticsClassPath, analyticsStudentPath, routes } from "@/config/routes"
import { Definitions, GroupSkillBars, pct, rate, ScoreCard } from "@/features/analytics/components/analytics-cards"
import { ProgressLineChart } from "@/features/analytics/components/progress-charts"
import { StudentPicker } from "@/features/analytics/components/student-picker"
import { groupSkillSummaries, groupSummary, groupTimeSeries, homeworkSummary, MIN_GROUP, parseRange } from "@/features/analytics/metrics"
import { listVisibleClasses, listVisibleStudents, loadAttendance, loadHomework, loadResults } from "@/features/analytics/server/analytics-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Progress") }
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.analytics)
  const db = await createClient()
  const staff = can(user.permissions, "analytics.read", ["all", "assigned"])
  const students = await listVisibleStudents(db)

  if (!staff) {
    // Students go straight to their own page; parents choose a child.
    const own = students.find((s) => s.profile_id === user.id)
    if (own) redirect(analyticsStudentPath(own.id))
    if (students.length === 1) redirect(analyticsStudentPath(students[0].id))
    return (
      <>
        <PageHeader title={t("Progress")} description={t("Choose a child to see their results, attendance and homework.")} />
        {students.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("No students are linked to your account.")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {students.map((s) => (
              <li key={s.id}>
                <Link href={analyticsStudentPath(s.id)} className="hover:bg-muted flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">{s.full_name}</span>
                  <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  const admin = can(user.permissions, "analytics.read", ["all"])
  const sp = await searchParams
  const today = todayInAcademy()
  const range = parseRange(firstParam(sp, "from"), firstParam(sp, "to"), today)
  const [results, homework, attendance, classes] = await Promise.all([
    loadResults(db, range),
    loadHomework(db, range),
    loadAttendance(db, range, "class"),
    listVisibleClasses(db),
  ])

  const everyone = groupSummary(results)
  const classWork = results.filter((r) => r.classId)
  const trend = groupTimeSeries(results, range)
  const hw = homeworkSummary(homework)

  const classRows = classes.map((c) => {
    const own = classWork.filter((r) => r.classId === c.id)
    const g = groupSummary(own)
    const counts = attendance.byGroup.get(c.id)
    const att = counts ? (counts.present + counts.late) / Math.max(1, counts.present + counts.late + counts.absent) : null
    const h = homeworkSummary(homework.filter((x) => x.class_id === c.id))
    return { ...c, group: g, attendance: counts && counts.present + counts.late + counts.absent > 0 ? att : null, homework: h.completionRate }
  })

  return (
    <>
      <PageHeader
        title={admin ? t("Academic analytics") : t("Progress")}
        description={admin ? t("Academy-wide figures: averages of students, never individual scores.") : t("Your classes and students. Open a class for its figures or a student for their own progress.")}
      />
      <DateRangeFilter basePath={routes.analytics} from={range.from} to={range.to} max={today} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label={admin ? t("All students") : t("Your students")}
          measure="Average percentage"
          value={everyone.suppressed ? "—" : pct(everyone.averageOfStudents)}
          basis={everyone.suppressed ? `Withheld: fewer than ${MIN_GROUP} students with results` : `Average of ${everyone.studentsWithResults} students' own averages`}
        />
        <ScoreCard label={t("Attendance")} measure="Rate" value={rate(attendance.rate)} basis={`${attendance.total.present + attendance.total.late} attended of ${attendance.total.present + attendance.total.late + attendance.total.absent} student-sessions`} />
        <ScoreCard label={t("Homework handed in")} measure="Rate" value={rate(hw.completionRate)} basis={hw.due ? `${Math.min(hw.handedIn, hw.due)} of ${hw.due} due pieces · ${hw.missing} missing` : "No homework due in this period"} />
        <ScoreCard label={t("Students with results")} measure="Count" value={String(everyone.studentsWithResults)} basis={`Of ${students.length} student${students.length === 1 ? "" : "s"} you can see`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Classes")}</CardTitle>
          <CardDescription>
            {t("Class work only (assignments, quizzes, tests, writing and speaking tasks). A class average is withheld when fewer than {MIN_GROUP} students have results.", { MIN_GROUP })}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-2 font-normal">{t("Class")}</th>
                <th className="py-2 text-right font-normal">{t("Students")}</th>
                <th className="py-2 text-right font-normal">{t("Average of students")}</th>
                <th className="py-2 text-right font-normal">{t("Attendance")}</th>
                <th className="py-2 text-right font-normal">{t("Homework handed in")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {classRows.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    <Link href={analyticsClassPath(c.id)} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">{c.students}</td>
                  <td className="py-2 text-right">
                    {c.group.suppressed ? <span className="text-muted-foreground text-xs">{c.group.studentsWithResults ? t("withheld ({studentsWithResults} with results)", { studentsWithResults: c.group.studentsWithResults }) : t("no results")}</span> : `${c.group.averageOfStudents}% (${c.group.studentsWithResults})`}
                  </td>
                  <td className="py-2 text-right">{rate(c.attendance)}</td>
                  <td className="py-2 text-right">{rate(c.homework)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("English skills")}</CardTitle>
            <CardDescription>{t("Students' averages per skill, class work and self-study together.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupSkillBars skills={groupSkillSummaries(results)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Find a student")}</CardTitle>
            <CardDescription>{t("Their own results over time, compared with the previous period.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <StudentPicker students={students} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Over time")}</CardTitle>
          <CardDescription>{t("Mean of students' averages per {granularity}; periods with fewer than {MIN_GROUP} students are left blank.", { granularity: trend.granularity, MIN_GROUP })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressLineChart granularity={trend.granularity} unit="students" series={[{ id: "all", label: "All scored work", buckets: trend.buckets }]} />
        </CardContent>
      </Card>

      <Definitions group />
    </>
  )
}
