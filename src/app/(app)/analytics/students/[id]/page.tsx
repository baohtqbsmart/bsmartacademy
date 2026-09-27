import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { DateRangeFilter } from "@/components/shared/date-range-filter"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analyticsStudentPath, routes } from "@/config/routes"
import { averageBasis, comparisonOf, Definitions, pct, rate, ResultsTable, ScoreCard, SkillBars, SourceTable } from "@/features/analytics/components/analytics-cards"
import { ProgressLineChart, SkillRadarChart } from "@/features/analytics/components/progress-charts"
import {
  compare,
  homeworkSummary,
  parseRange,
  previousRange,
  radarSkills,
  SKILL_NAMES,
  skillSummaries,
  sourceSummaries,
  summarize,
  timeSeries,
  vocabularySummary,
} from "@/features/analytics/metrics"
import { getStudentHeader, loadAttendance, loadHomework, loadResults, loadVocabulary } from "@/features/analytics/server/analytics-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Student progress" }

export default async function StudentProgressPage({ params, searchParams }: PageProps<"/analytics/students/[id]">) {
  await requireRouteAccess(routes.analyticsStudent)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  // RLS: only the student, their parents, their teachers and admins get a row.
  const student = await getStudentHeader(db, id)
  if (!student) notFound()

  const sp = await searchParams
  const today = todayInAcademy()
  const range = parseRange(firstParam(sp, "from"), firstParam(sp, "to"), today)
  const before = previousRange(range)
  const [results, previous, homework, homeworkBefore, attendance, attendanceBefore, vocabulary] = await Promise.all([
    loadResults(db, range, { studentId: id }),
    loadResults(db, before, { studentId: id }),
    loadHomework(db, range, { studentId: id }),
    loadHomework(db, before, { studentId: id }),
    loadAttendance(db, range, "student", { studentId: id }),
    loadAttendance(db, before, "student", { studentId: id }),
    loadVocabulary(db, id),
  ])

  const overall = summarize(results)
  const overallBefore = summarize(previous)
  const change = compare(overall, overallBefore)
  const skills = skillSummaries(results)
  const skillsBefore = new Map(skillSummaries(previous).map((s) => [s.skill, s.averagePercent]))
  const radar = radarSkills(skills)
  const hw = homeworkSummary(homework)
  const hwBefore = homeworkSummary(homeworkBefore)
  const vocab = vocabularySummary(vocabulary)
  const tests = summarize(results.filter((r) => r.source === "test"))
  const testsBefore = summarize(previous.filter((r) => r.source === "test"))
  const teacherAssessed = results.filter((r) => r.assessedBy === "teacher")
  const previousLabel = `${formatDate(before.from)}–${formatDate(before.to)}`
  const series = timeSeries(results, range)
  const skillSeries = skills
    .filter((s) => s.scored > 0)
    .map((s) => ({ id: s.skill, label: SKILL_NAMES[s.skill], buckets: timeSeries(results.filter((r) => r.skill === s.skill), range).buckets }))
  const nonEnglish = summarize(results.filter((r) => !r.skill || !(r.skill in SKILL_NAMES)))

  return (
    <>
      <Link href={routes.analytics} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Progress
      </Link>
      <PageHeader
        title={student.full_name}
        description={`${student.student_code} · ${student.classes.map((c) => c.name).join(", ") || "No current class"}`}
        actions={
          <div className="flex flex-col items-end gap-1 text-sm">
            <span className="flex items-center gap-2">
              <Badge variant="outline">Level</Badge>
              {student.level ? `${student.level.name}${student.level.cefr ? ` (≈ CEFR ${student.level.cefr})` : ""}` : "Not recorded"}
            </span>
            {student.target && <span className="text-muted-foreground text-xs">Target: {student.target.name} · levels are recorded by staff, not calculated</span>}
          </div>
        }
      />
      <DateRangeFilter basePath={analyticsStudentPath(id)} from={range.from} to={range.to} max={today} />
      <p className="text-muted-foreground -mt-3 text-xs">
        Compared with the {range.days} days before ({previousLabel}).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="All scored work" measure="Average percentage" value={pct(overall.averagePercent)} basis={averageBasis(overall)} comparison={comparisonOf(change, "Before")} warning={overall.lowConfidence ? "Fewer than 3 results" : null} />
        <ScoreCard label="Tests" measure="Average percentage" value={pct(tests.averagePercent)} basis={averageBasis(tests) + (tests.scored ? " (best attempt each)" : "")} comparison={comparisonOf(compare(tests, testsBefore), "Before")} />
        <ScoreCard
          label="Attendance"
          measure="Rate"
          value={rate(attendance.rate)}
          basis={`${attendance.total.present + attendance.total.late} of ${attendance.total.present + attendance.total.late + attendance.total.absent} sessions attended (excused not counted)`}
          comparison={{ text: `Before: ${rate(attendanceBefore.rate)}`, delta: attendance.rate !== null && attendanceBefore.rate !== null ? Math.round((attendance.rate - attendanceBefore.rate) * 100) : null }}
        />
        <ScoreCard
          label="Homework handed in"
          measure="Rate"
          value={rate(hw.completionRate)}
          basis={hw.due ? `${Math.min(hw.handedIn, hw.due)} of ${hw.due} due (${hw.late} late, ${hw.missing} missing)${hw.notDue ? ` · ${hw.notDue} not due yet` : ""}` : "No homework due in this period"}
          comparison={{ text: `Before: ${rate(hwBefore.completionRate)}`, delta: hw.completionRate !== null && hwBefore.completionRate !== null ? Math.round((hw.completionRate - hwBefore.completionRate) * 100) : null }}
        />
        <ScoreCard label="Teacher-assessed work" measure="Teacher assessment" value={pct(summarize(teacherAssessed).averagePercent)} basis={averageBasis(summarize(teacherAssessed))} />
        <ScoreCard label="Vocabulary" measure="Count" value={`${vocab.secure} / ${vocab.total}`} basis="Words secure (reviewed after a week or more) of the words practised — current, not limited by the dates" />
        <ScoreCard label="Other subjects" measure="Average percentage" value={pct(nonEnglish.averagePercent)} basis={averageBasis(nonEnglish) + " (work without an English skill)"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>English skills</CardTitle>
            <CardDescription>Average percentage per skill in the chosen dates. Each bar shows how many results it rests on and who marked them.</CardDescription>
          </CardHeader>
          <CardContent>
            <SkillBars skills={skills} previous={skillsBefore} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Skill profile</CardTitle>
            <CardDescription>{radar ? "Skills with results only; a missing skill is not a zero." : "Shown when at least three skills have results — use the bars until then."}</CardDescription>
          </CardHeader>
          <CardContent>
            {radar ? (
              <SkillRadarChart data={radar.map((s) => ({ skill: SKILL_NAMES[s.skill], value: s.averagePercent!, results: s.scored }))} />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">{skills.filter((s) => s.scored > 0).length} of 7 skills have results in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress over time</CardTitle>
          <CardDescription>
            Average percentage per {series.granularity}. Gaps are periods without results (not zeros). Bands are not included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressLineChart granularity={series.granularity} series={[{ id: "all", label: "All scored work", buckets: series.buckets }, ...skillSeries]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By source</CardTitle>
          <CardDescription>Assignments, quizzes and tests are class work; exercises and practice are self-study.</CardDescription>
        </CardHeader>
        <CardContent>
          <SourceTable rows={sourceSummaries(results)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All results ({results.length})</CardTitle>
          <CardDescription>The raw scores behind every number on this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResultsTable results={results} />
        </CardContent>
      </Card>

      <Definitions />
    </>
  )
}
