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
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Test attempt") }
}

export default async function AttemptPage({ params, searchParams }: PageProps<"/tests/[id]/attempts/[attemptId]">) {
  const t = await getT()
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
        <PageHeader title={test.title} description={t("{value} · attempt {attempt_number}", { value: attempt.student?.full_name ?? "", attempt_number: attempt.attempt_number })} />
        <p className="text-muted-foreground text-sm">{t("This attempt is still in progress.")}</p>
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
      <PageHeader title={t("{value} · attempt {attempt_number}", { value: attempt.student?.full_name ?? "Attempt", attempt_number: attempt.attempt_number })} description={test.title} />

      {justSubmitted && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{t("Test submitted")}</AlertTitle>
          <AlertDescription>
            {t("Handed in {dateTime}. Reference: {value}.{value2}", { dateTime: formatDateTime(attempt.submitted_at), value: attempt.id.slice(0, 8).toUpperCase(), value2: attempt.status === "graded" ? " It has been marked automatically." : " Some answers will be marked by your teacher." })}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Fact label={t("Result")}>
            {attempt.status === "graded" ? (
              <span className="text-2xl font-semibold tabular-nums">{`${Number(attempt.score)} / ${total}`}</span>
            ) : (
              <span>{t("Waiting for marking")}{canGrade && t(" ({toMark} to mark)", { toMark })}</span>
            )}
          </Fact>
          {canGrade && attempt.raw_max !== null && (
            <Fact label={t("Points")}>
              <span className="tabular-nums">{`${Number(attempt.raw_score)} / ${Number(attempt.raw_max)}`}</span>
            </Fact>
          )}
          <Fact label={t("Handed in")}>
            {formatDateTime(attempt.submitted_at)}
            {attempt.auto_submitted && t(" (time ran out)")}
          </Fact>
          <Fact label={t("Started")}>{formatDateTime(attempt.started_at)}</Fact>
        </CardContent>
      </Card>

      {!reviewOpen && (
        <Alert>
          <LockIcon />
          <AlertTitle>{t("Marks and answers are not shown yet")}</AlertTitle>
          <AlertDescription>{t("Correct answers and marks per question are shown {value}.", { value: REVIEW_POLICY_LABELS[test.review_policy].toLowerCase() })}</AlertDescription>
        </Alert>
      )}

      <AttemptReview rows={details} attemptId={attempt.id} canGrade={canGrade} />
    </>
  )
}

async function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  const t = await getT()
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{t(label)}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}
