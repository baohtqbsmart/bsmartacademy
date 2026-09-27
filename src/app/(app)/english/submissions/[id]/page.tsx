import { ArrowLeftIcon, CircleCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { lessonPath, routes } from "@/config/routes"
import { ReviewForm } from "@/features/english/components/lesson-work"
import { getSubmission, type RubricCriterion } from "@/features/english/server/lesson-service"
import { SKILL_LABELS } from "@/features/english/skills"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("English work") }
}

export default async function SubmissionPage({ params, searchParams }: PageProps<"/english/submissions/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.lessonSubmission)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  // RLS: the student's own, a parent's children's, a teacher's students'.
  const submission = await getSubmission(await createClient(), id)
  if (!submission || !submission.lesson) notFound()

  const rubric = (submission.lesson.rubric ?? []) as RubricCriterion[]
  const scores = (submission.rubric_scores ?? null) as number[] | null
  const words = submission.text_response?.trim().split(/\s+/).filter(Boolean).length ?? 0
  const justSubmitted = firstParam(await searchParams, "submitted") === "1"
  // The database decides (teachers of this student, admins); the form is offered to reviewers.
  const canReview = can(user.permissions, "english.review")

  return (
    <>
      <Link href={lessonPath(submission.lesson.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {submission.lesson.title}
      </Link>
      <PageHeader
        title={t("{value} · {title}", { value: submission.student?.full_name ?? "", title: submission.lesson.title })}
        description={t("Attempt {attempt} · handed in {dateTime}", { attempt: submission.attempt, dateTime: formatDateTime(submission.submitted_at) })}
        actions={<Badge variant="outline">{t(SKILL_LABELS[submission.lesson.skill])}</Badge>}
      />
      {justSubmitted && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{t("Handed in")}</AlertTitle>
          <AlertDescription>{t("Your teacher will give you feedback. Reference: {value}.", { value: submission.id.slice(0, 8).toUpperCase() })}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Work")}</CardTitle>
            {submission.text_response && submission.lesson.skill === "writing" && <CardDescription className="tabular-nums">{t("{words} words", { words })}</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-3">
            {submission.fileUrl &&
              (submission.file_mime?.startsWith("video/") ? (
                <video controls src={submission.fileUrl} className="max-h-96 w-full rounded-md" />
              ) : (
                <audio controls src={submission.fileUrl} className="w-full" />
              ))}
            {submission.text_response && <p className="text-sm leading-6 whitespace-pre-wrap">{submission.text_response}</p>}
          </CardContent>
        </Card>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("Feedback")}</CardTitle>
            {submission.status === "reviewed" && (
              <CardDescription>
                {submission.reviewed_by_name} · {formatDateTime(submission.reviewed_at)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {submission.status === "reviewed" ? (
              <div className="grid gap-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {Number(submission.score)} / {Number(submission.max_score)}
                </p>
                {rubric.length > 0 && scores && (
                  <ul className="grid gap-1 text-sm">
                    {rubric.map((r, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{r.criterion}</span>
                        <span className="tabular-nums">
                          {scores[i]} / {r.max_points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm whitespace-pre-wrap">{submission.feedback}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("Waiting for the teacher's feedback.")}</p>
            )}
            {canReview && (
              <div className="border-t pt-4">
                <ReviewForm
                  submissionId={submission.id}
                  rubric={rubric}
                  maxScore={Number(submission.max_score)}
                  initial={{ feedback: submission.feedback ?? "", scores, score: submission.score === null ? null : Number(submission.score) }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
