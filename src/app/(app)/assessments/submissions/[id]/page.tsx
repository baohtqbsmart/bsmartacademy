import { ArrowLeftIcon, CircleCheckIcon, DownloadIcon, HistoryIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assessmentHistoryPath, assessmentPath, assessmentSubmissionPath, routes } from "@/config/routes"
import { AnnotatedText, AnnotationList } from "@/features/assessments/components/feedback-view"
import { GradingPanel } from "@/features/assessments/components/grading-panel"
import { getSubmission, getTask, listComments, listTaskSubmissions, type Submission, type Task } from "@/features/assessments/server/assessment-service"
import { IELTS_NOTICE, KIND_LABELS } from "@/features/assessments/scoring"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Writing or speaking work") }
}

const EVENT_LABELS = {
  submitted: "Handed in",
  returned: "Feedback returned",
  resubmission_allowed: "Resubmission allowed",
  resubmission_revoked: "Resubmission withdrawn",
} as const

export default async function SubmissionPage({ params, searchParams }: PageProps<"/assessments/submissions/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.assessmentSubmission)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()

  // RLS: the student's own, a parent's children's, a teacher's students'.
  const submission = await getSubmission(db, id)
  if (!submission) notFound()
  const task = await getTask(db, submission.task_id)
  if (!task) notFound()

  // Grading tools for class teachers and admins; the database checks each action.
  const canGrade = can(user.permissions, "assessments.write")
  const [attempts, library] = await Promise.all([
    listTaskSubmissions(db, task.id, submission.student_id),
    canGrade ? listComments(db) : [],
  ])
  const isLatest = attempts[0]?.id === submission.id
  const grade = submission.assessment_grades
  const justSubmitted = firstParam(await searchParams, "submitted") === "1"

  return (
    <>
      <Link href={assessmentPath(task.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {task.title}
      </Link>
      <PageHeader
        title={t("{value} · attempt {attempt}", { value: submission.student?.full_name ?? "", attempt: submission.attempt })}
        description={t("{title} · handed in {dateTime}{value}", { title: task.title, dateTime: formatDateTime(submission.submitted_at), value: submission.word_count !== null ? ` · ${submission.word_count} words` : "" })}
        actions={
          <>
            <Badge variant="outline">{t(KIND_LABELS[task.kind])}</Badge>
            {submission.is_late && <Badge variant="outline">{t("Late")}</Badge>}
            {submission.student && (
              <Link href={assessmentHistoryPath(submission.student.id)} className="inline-flex items-center gap-1 text-sm underline">
                <HistoryIcon className="size-4" aria-hidden /> {t("History")}
              </Link>
            )}
          </>
        }
      />
      {justSubmitted && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{t("Handed in")}</AlertTitle>
          <AlertDescription>
            {t("Your teacher will return feedback here. Reference: {value}.", { value: submission.id.slice(0, 8).toUpperCase() })}
          </AlertDescription>
        </Alert>
      )}

      {submission.fileUrl && (
        <p className="text-sm">
          <a href={submission.fileUrl} className="inline-flex items-center gap-1 underline">
            <DownloadIcon className="size-4" aria-hidden /> {submission.file_name}
          </a>
        </p>
      )}

      {canGrade ? (
        <GradingPanel
          submissionId={submission.id}
          kind={task.kind}
          text={submission.text_response}
          media={submission.playUrl && submission.file_mime ? { url: submission.playUrl, mime: submission.file_mime } : null}
          annotations={submission.annotations}
          library={library}
          criteria={task.criteriaList}
          scoring={task.scoring}
          maxScore={Number(task.max_score)}
          grade={{
            scores: grade ? (grade.criterion_scores as number[]) : null,
            feedback: grade?.feedback ?? null,
            returned: Boolean(grade?.returned_at),
          }}
          resubmission={{ isLatest, allowed: submission.resubmission_allowed }}
        />
      ) : (
        <FamilyView submission={submission} task={task} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("History")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ul className="grid gap-1">
            {attempts.map((a) => (
              <li key={a.id}>
                {a.id === submission.id ? (
                  <span className="font-medium">{t("Attempt {attempt} (shown)", { attempt: a.attempt })}</span>
                ) : (
                  <Link href={assessmentSubmissionPath(a.id)} className="hover:underline">
                    {t("Attempt {attempt}", { attempt: a.attempt })}
                  </Link>
                )}{" "}
                <span className="text-muted-foreground tabular-nums">· {formatDateTime(a.submitted_at)}</span>
                {a.assessment_grades && <span className="tabular-nums"> · {`${Number(a.assessment_grades.total_score)} / ${Number(task.max_score)}`}</span>}
              </li>
            ))}
          </ul>
          <ul className="text-muted-foreground grid gap-0.5 border-l pl-3">
            {[...submission.assessment_events]
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((e) => (
                <li key={e.id}>
                  <span className="tabular-nums">{formatDateTime(e.created_at)}</span> · {t(EVENT_LABELS[e.event])}
                  {e.actor_name && ` · ${e.actor_name}`}
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}

async function FamilyView({ submission, task }: { submission: Submission; task: Task }) {
  const t = await getT()
  const grade = submission.assessment_grades
  const scores = (grade?.criterion_scores ?? []) as number[]
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t("Work")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {submission.playUrl && submission.file_mime?.startsWith("video/") && <video controls src={submission.playUrl} className="max-h-96 w-full rounded-md" />}
          {submission.playUrl && submission.file_mime?.startsWith("audio/") && <audio controls src={submission.playUrl} className="w-full" />}
          {submission.text_response && <AnnotatedText text={submission.text_response} annotations={submission.annotations} />}
          {grade && (
            <div className="grid gap-2">
              <h3 className="font-medium">{t("Comments")}</h3>
              <AnnotationList annotations={submission.annotations} />
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="content-start">
        <CardHeader>
          <CardTitle>{t("Feedback")}</CardTitle>
          {grade && (
            <CardDescription>
              {grade.graded_by_name} · {formatDateTime(grade.returned_at)}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          {!grade ? (
            <p className="text-muted-foreground text-sm">{t("Your teacher has not returned feedback yet.")}</p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {task.scoring === "ielts_band" ? t("Band {number}", { number: Number(grade.total_score) }) : `${Number(grade.total_score)} / ${Number(task.max_score)}`}
              </p>
              {task.scoring === "ielts_band" && <p className="text-muted-foreground text-xs">{IELTS_NOTICE}</p>}
              <ul className="grid gap-1 text-sm">
                {task.criteriaList.map((c, i) => (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span>{c.name}</span>
                    <span className="tabular-nums">
                      {scores[i]} / {c.max_points}
                    </span>
                  </li>
                ))}
              </ul>
              {grade.feedback && <p className="text-sm whitespace-pre-wrap">{grade.feedback}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
