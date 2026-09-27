import { ArrowLeftIcon, ShieldCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analyticsClassPath, routes } from "@/config/routes"
import { Definitions, GroupSkillBars, pct, rate, ScoreCard } from "@/features/analytics/components/analytics-cards"
import { DistributionChart, ProgressLineChart } from "@/features/analytics/components/progress-charts"
import { groupSkillSummaries, groupSummary, groupTimeSeries, homeworkSummary, itemSummaries, MIN_GROUP, parseRange, previousRange, SOURCES } from "@/features/analytics/metrics"
import { getClassHeader, listVisibleClasses, loadAttendance, loadHomework, loadResults } from "@/features/analytics/server/analytics-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Class progress" }

/**
 * Class-level figures only: no student names or individual scores. Averages
 * are of students' own averages and are withheld below MIN_GROUP students.
 */
export default async function ClassProgressPage({ params, searchParams }: PageProps<"/analytics/classes/[id]">) {
  await requireRouteAccess(routes.analyticsClass)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const klass = await getClassHeader(db, id)
  if (!klass) notFound()

  const sp = await searchParams
  const today = todayInAcademy()
  const range = parseRange(firstParam(sp, "from"), firstParam(sp, "to"), today)
  const before = previousRange(range)
  const [results, previous, homework, attendance, attendanceBefore, classes] = await Promise.all([
    loadResults(db, range, { classId: id }),
    loadResults(db, before, { classId: id }),
    loadHomework(db, range, { classId: id }),
    loadAttendance(db, range, "class", { classId: id }),
    loadAttendance(db, before, "class", { classId: id }),
    listVisibleClasses(db),
  ])
  const enrolled = classes.find((c) => c.id === id)?.students ?? 0

  const classWork = results.filter((r) => r.classId === id)
  const group = groupSummary(classWork)
  const groupBefore = groupSummary(previous.filter((r) => r.classId === id))
  const hw = homeworkSummary(homework)
  const trend = groupTimeSeries(classWork, range)
  const items = itemSummaries(classWork)
  const delta = !group.suppressed && !groupBefore.suppressed ? Math.round((group.averageOfStudents - groupBefore.averageOfStudents) * 10) / 10 : null

  return (
    <>
      <Link href={routes.analytics} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Progress
      </Link>
      <PageHeader title={klass.name} description={`Class progress · ${klass.code}${klass.course?.name ? ` · ${klass.course.name}` : ""}`} />
      <DateRangeFilter basePath={analyticsClassPath(id)} from={range.from} to={range.to} max={today} />
      <p className="text-muted-foreground -mt-3 flex items-center gap-1.5 text-xs">
        <ShieldCheckIcon className="size-3.5" aria-hidden /> Class figures only — no names or individual scores. Open a student from the Progress page to see their own results.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label="Class work"
          measure="Average percentage"
          value={group.suppressed ? "—" : pct(group.averageOfStudents)}
          basis={group.suppressed ? `Withheld: ${group.studentsWithResults} of ${enrolled} students have results (fewer than ${MIN_GROUP})` : `Average of ${group.studentsWithResults} of ${enrolled} students' own averages`}
          comparison={{ text: `${formatDate(before.from)}–${formatDate(before.to)}: ${groupBefore.suppressed ? "—" : pct(groupBefore.averageOfStudents)}`, delta }}
        />
        <ScoreCard
          label="Attendance"
          measure="Rate"
          value={rate(attendance.rate)}
          basis={`${attendance.total.present + attendance.total.late} attended of ${attendance.total.present + attendance.total.late + attendance.total.absent} student-sessions`}
          comparison={{ text: `Before: ${rate(attendanceBefore.rate)}`, delta: attendance.rate !== null && attendanceBefore.rate !== null ? Math.round((attendance.rate - attendanceBefore.rate) * 100) : null }}
        />
        <ScoreCard
          label="Homework handed in"
          measure="Rate"
          value={rate(hw.completionRate)}
          basis={hw.due ? `${Math.min(hw.handedIn, hw.due)} of ${hw.due} due pieces (${hw.late} late, ${hw.missing} missing)` : "No homework due in this period"}
        />
        <ScoreCard label="Students" measure="Count" value={String(enrolled)} basis={`${group.studentsWithResults} with scored class work in this period`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spread of student averages</CardTitle>
            <CardDescription>How many students&apos; own averages fall in each range.</CardDescription>
          </CardHeader>
          <CardContent>
            {group.suppressed ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Withheld: fewer than {MIN_GROUP} students have results.</p>
            ) : (
              <DistributionChart data={group.distribution} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>English skills</CardTitle>
            <CardDescription>Students&apos; averages per skill (class work and their own English practice).</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupSkillBars skills={groupSkillSummaries(results)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class work over time</CardTitle>
          <CardDescription>Mean of students&apos; averages per {trend.granularity}; periods with fewer than {MIN_GROUP} students are left blank.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressLineChart granularity={trend.granularity} unit="students" series={[{ id: "class", label: "Class work", buckets: trend.buckets }]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By piece of work</CardTitle>
          <CardDescription>Average percentage per assignment, test or task — only where at least {MIN_GROUP} students have a published result.</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No published class results in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="py-2 font-normal">Work</th>
                    <th className="py-2 font-normal">Type</th>
                    <th className="py-2 text-right font-normal">Students</th>
                    <th className="py-2 text-right font-normal">Average percentage</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {items.map((i) => (
                    <tr key={i.itemId} className="border-t">
                      <td className="py-2">{i.title}</td>
                      <td className="text-muted-foreground py-2 text-xs">{SOURCES[i.source].label}</td>
                      <td className="py-2 text-right">{i.students}</td>
                      <td className="py-2 text-right">{i.average === null ? <span className="text-muted-foreground text-xs">withheld (fewer than {MIN_GROUP})</span> : `${i.average}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Definitions group />
    </>
  )
}
