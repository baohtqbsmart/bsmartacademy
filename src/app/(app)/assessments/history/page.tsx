import { HistoryIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { StatTiles } from "@/components/shared/stat-tiles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assessmentHistoryPath, assessmentSubmissionPath, routes } from "@/config/routes"
import { listHistory, type HistoryRow } from "@/features/assessments/server/assessment-service"
import { criterionAverages, KIND_LABELS, type AssessmentKind } from "@/features/assessments/scoring"
import { listVisibleStudents } from "@/features/english/server/dashboard-service"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Assessment history" }

export default async function HistoryPage({ searchParams }: PageProps<"/assessments/history">) {
  const user = await requireRouteAccess(routes.assessmentHistory)
  const db = await createClient()
  const requested = uuidParam(await searchParams, "student")

  let studentId: string | null = null
  let students: { id: string; full_name: string }[] = []
  if (can(user.permissions, "assessments.submit", ["own"])) {
    studentId = await getOwnStudentId(db, user.id)
  } else {
    // Parents: their children; staff: the students they can see (RLS).
    students = await listVisibleStudents(db)
    studentId = students.find((s) => s.id === requested)?.id ?? (can(user.permissions, "assessments.read", ["children"]) ? students[0]?.id ?? null : null)
  }

  const history = studentId ? await listHistory(db, studentId) : []
  const name = students.find((s) => s.id === studentId)?.full_name

  return (
    <>
      <PageHeader title="Assessment history" description={name ? `${name}'s writing and speaking over time.` : "Writing and speaking over time."} />
      {students.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <Button key={s.id} size="sm" variant={s.id === studentId ? "default" : "outline"} asChild>
              <Link href={assessmentHistoryPath(s.id)}>{s.full_name}</Link>
            </Button>
          ))}
        </div>
      )}
      {!studentId ? (
        <EmptyState icon={HistoryIcon} title="Choose a student" />
      ) : (
        <StudentHistory history={history} />
      )}
    </>
  )
}

function StudentHistory({ history }: { history: HistoryRow[] }) {
  const returned = history.filter((h) => h.assessment_grades?.returned_at)
  const share = (h: HistoryRow) => Number(h.assessment_grades!.total_score) / Number(h.task?.max_score ?? 1)
  const average = returned.length ? returned.reduce((sum, h) => sum + share(h), 0) / returned.length : null
  const byKind = (kind: AssessmentKind) =>
    criterionAverages(
      returned
        .filter((h) => h.task?.kind === kind)
        .map((h) => ({ criteria: h.criteriaList, scores: h.assessment_grades!.criterion_scores as number[] }))
    )

  return (
    <>
      <StatTiles
        tiles={[
          { label: "Handed in", value: history.length, kind: "count" },
          { label: "Feedback returned", value: returned.length, kind: "count" },
          { label: "Average", value: average, kind: "percent", hint: "Share of the maximum, returned work" },
          { label: "Writing", value: returned.filter((h) => h.task?.kind === "writing").length, kind: "count", hint: "Returned" },
          { label: "Speaking", value: returned.filter((h) => h.task?.kind === "speaking").length, kind: "count", hint: "Returned" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {(["writing", "speaking"] as const).map((kind) => {
          const rows = byKind(kind)
          return (
            <Card key={kind}>
              <CardHeader>
                <CardTitle>{KIND_LABELS[kind]} by criterion</CardTitle>
                <CardDescription>Average share of each criterion&apos;s maximum; weakest first.</CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No returned {kind} yet.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {rows.map((r) => (
                      <li key={r.name} className="grid gap-1">
                        <span className="flex justify-between gap-2">
                          <span>{r.name}</span>
                          <span className="tabular-nums">
                            {Math.round(r.average * 100)}% <span className="text-muted-foreground">({r.count})</span>
                          </span>
                        </span>
                        <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                          <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.round(r.average * 100)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      <SimpleTable
        rows={history}
        rowKey={(h) => h.id}
        empty={<EmptyState icon={HistoryIcon} title="Nothing handed in yet" />}
        columns={[
          { header: "Handed in", cell: (h) => <span className="tabular-nums">{formatDateTime(h.submitted_at)}</span> },
          {
            header: "Task",
            cell: (h) => (
              <Link href={assessmentSubmissionPath(h.id)} className="font-medium hover:underline">
                {h.task?.title}
              </Link>
            ),
          },
          { header: "Kind", cell: (h) => (h.task ? <Badge variant="outline">{KIND_LABELS[h.task.kind]}</Badge> : "—") },
          { header: "Class", cell: (h) => h.task?.class?.name ?? "—" },
          { header: "Attempt", cell: (h) => h.attempt },
          {
            header: "Result",
            cell: (h) =>
              h.assessment_grades?.returned_at ? (
                <span className="tabular-nums">
                  {h.task?.scoring === "ielts_band" ? `Band ${Number(h.assessment_grades.total_score)}` : `${Number(h.assessment_grades.total_score)} / ${Number(h.task?.max_score)}`}
                </span>
              ) : (
                <span className="text-muted-foreground">{h.assessment_grades ? "Graded, not returned" : "Waiting for feedback"}</span>
              ),
          },
        ]}
      />
    </>
  )
}
