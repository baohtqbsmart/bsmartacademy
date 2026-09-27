import { ArrowLeftIcon, CircleCheckIcon, LockIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { routes, testPath } from "@/config/routes"
import { AttemptReview } from "@/features/tests/components/attempt-review"
import { REVIEW_POLICY_LABELS } from "@/features/tests/questions"
import { getAttempt, getAttemptDetails } from "@/features/tests/server/attempt-service"
import { getTest } from "@/features/tests/server/test-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Test attempt" }

export default async function AttemptPage({ params, searchParams }: PageProps<"/tests/[id]/attempts/[attemptId]">) {
  const user = await requireRouteAccess(routes.testAttempt)
  const { id, attemptId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(attemptId).success) notFound()

  const db = await createClient()
  // RLS: the student's own, a parent's children's, a teacher's class's.
  const [test, attempt] = await Promise.all([getTest(db, id), getAttempt(db, attemptId)])
  if (!test || !attempt || attempt.test_id !== test.id) notFound()
  if (attempt.status === "in_progress") {
    return (
      <>
        <PageHeader title={test.title} description={`${attempt.student?.full_name ?? ""} · attempt ${attempt.attempt_number}`} />
        <p className="text-muted-foreground text-sm">This attempt is still in progress.</p>
      </>
    )
  }

  // The database decides what this viewer may see (review policy).
  const details = await getAttemptDetails(db, attempt.id)
  const reviewOpen = details.some((d) => d.review_open)
  const canGrade = can(user.permissions, "tests.write")
  const total = Number(test.total_score)
  const justSubmitted = firstParam(await searchParams, "submitted") === "1"
  const toMark = details.filter((d) => d.needs_review && d.manual_score === null).length

  return (
    <>
      <Link href={testPath(test.id, canGrade ? "results" : undefined)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {test.title}
      </Link>
      <PageHeader title={`${attempt.student?.full_name ?? "Attempt"} · attempt ${attempt.attempt_number}`} description={test.title} />

      {justSubmitted && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Test submitted</AlertTitle>
          <AlertDescription>
            Handed in {formatDateTime(attempt.submitted_at)}. Reference: {attempt.id.slice(0, 8).toUpperCase()}.
            {attempt.status === "graded" ? " It has been marked automatically." : " Some answers will be marked by your teacher."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Fact label="Result">
            {attempt.status === "graded" ? (
              <span className="text-2xl font-semibold tabular-nums">{`${Number(attempt.score)} / ${total}`}</span>
            ) : (
              <span>Waiting for marking{canGrade && ` (${toMark} to mark)`}</span>
            )}
          </Fact>
          {canGrade && attempt.raw_max !== null && (
            <Fact label="Points">
              <span className="tabular-nums">{`${Number(attempt.raw_score)} / ${Number(attempt.raw_max)}`}</span>
            </Fact>
          )}
          <Fact label="Handed in">
            {formatDateTime(attempt.submitted_at)}
            {attempt.auto_submitted && " (time ran out)"}
          </Fact>
          <Fact label="Started">{formatDateTime(attempt.started_at)}</Fact>
        </CardContent>
      </Card>

      {!reviewOpen && (
        <Alert>
          <LockIcon />
          <AlertTitle>Marks and answers are not shown yet</AlertTitle>
          <AlertDescription>Correct answers and marks per question are shown {REVIEW_POLICY_LABELS[test.review_policy].toLowerCase()}.</AlertDescription>
        </Alert>
      )}

      <AttemptReview rows={details} attemptId={attempt.id} canGrade={canGrade} />
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}
