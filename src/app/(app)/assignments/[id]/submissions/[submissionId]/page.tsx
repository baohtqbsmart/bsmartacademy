import { ArrowLeftIcon, RotateCcwIcon, UndoIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, routes, studentPath, submissionPath } from "@/config/routes"
import { setResubmissionAction } from "@/features/assignments/actions"
import { WorkStatusBadge } from "@/features/assignments/components/badges"
import { GradeForm } from "@/features/assignments/components/grade-form"
import { AttemptAnswers, SubmissionHistory } from "@/features/assignments/components/submission-view"
import { getAnswerKeys, getAssignment } from "@/features/assignments/server/assignment-service"
import { getAutoMarks, getSubmission, listAttempts } from "@/features/assignments/server/submission-service"
import { workStatus } from "@/features/assignments/status"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Grade submission") }
}

export default async function SubmissionPage({ params }: PageProps<"/assignments/[id]/submissions/[submissionId]">) {
  const t = await getT()
  await requireRouteAccess(routes.submissionDetail)
  const { id, submissionId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(submissionId).success) notFound()

  const db = await createClient()
  const [assignment, submission] = await Promise.all([getAssignment(db, id), getSubmission(db, submissionId)])
  // RLS: teachers only see submissions from their classes' students.
  if (!assignment || !submission || submission.assignment_id !== assignment.id) notFound()

  const [keys, marks, attempts] = await Promise.all([
    getAnswerKeys(db, assignment.questions.map((q) => q.id)),
    submission.status === "in_progress" ? new Map() : getAutoMarks(db, submission.id),
    listAttempts(db, assignment.id, submission.student_id),
  ])
  const latest = attempts.at(-1)
  const isLatest = latest?.id === submission.id

  // Auto-marks cover objective questions; scale their share of all points to the maximum score.
  const totalPoints = assignment.questions.reduce((sum, q) => sum + Number(q.points), 0)
  const objective = [...marks.values()].filter((m) => m.correct !== null)
  const earned = objective.reduce((sum, m) => sum + Number(m.earned), 0)
  const allObjective = objective.length === assignment.questions.length && totalPoints > 0
  const suggestion = allObjective ? Math.round((earned / totalPoints) * Number(assignment.max_score) * 100) / 100 : null

  return (
    <>
      <Link href={assignmentPath(assignment.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {assignment.title}
      </Link>
      <PageHeader
        title={submission.student?.full_name ?? t("Submission")}
        description={t("{title} · attempt {attempt}", { title: assignment.title, attempt: submission.attempt })}
        actions={<WorkStatusBadge status={workStatus(submission, assignment.due_at, "staff")} />}
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Work handed in")}</CardTitle>
            <CardDescription>
              {submission.submitted_at ? t("Handed in {dateTime}", { dateTime: formatDateTime(submission.submitted_at) }) : t("Not handed in yet")}
              {submission.is_late && t(" · late")}
              {objective.length > 0 &&
                t(" · auto-marked: {earned} of {objective} points on {length} objective question{value}", { earned, objective: objective.reduce((sum, m) => sum + Number(m.points), 0), length: objective.length, value: objective.length === 1 ? "" : "s" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttemptAnswers attempt={submission} questions={assignment.questions} keys={keys} marks={marks} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          {submission.status !== "in_progress" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Grade")}</CardTitle>
                <CardDescription>{t("The student sees the score and feedback only once you return it.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <GradeForm
                  submissionId={submission.id}
                  maxScore={Number(assignment.max_score)}
                  initial={{ score: submission.submission_grades?.score ?? null, feedback: submission.submission_grades?.feedback ?? null }}
                  returned={Boolean(submission.submission_grades?.returned_at)}
                  suggestion={suggestion}
                />
              </CardContent>
            </Card>
          )}

          {isLatest && submission.status !== "in_progress" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Resubmission")}</CardTitle>
                <CardDescription>
                  {submission.resubmission_allowed
                    ? t("The student may start a new attempt (their answers are copied into it).")
                    : t("Handed-in work is locked. Allow a resubmission to let the student try again; this attempt is kept in the history.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfirmActionButton
                  title={submission.resubmission_allowed ? t("Withdraw the resubmission?") : t("Allow a resubmission?")}
                  description={
                    submission.resubmission_allowed
                      ? t("The student will no longer be able to start a new attempt.")
                      : "The student can start attempt " + (submission.attempt + 1) + " while the assignment is open."
                  }
                  confirmLabel={submission.resubmission_allowed ? t("Withdraw") : t("Allow")}
                  successMessage={t("Saved.")}
                  action={setResubmissionAction.bind(null, { submissionId: submission.id, allowed: !submission.resubmission_allowed })}
                >
                  {submission.resubmission_allowed ? <UndoIcon aria-hidden /> : <RotateCcwIcon aria-hidden />}
                  {submission.resubmission_allowed ? t("Withdraw resubmission") : t("Allow resubmission")}
                </ConfirmActionButton>
              </CardContent>
            </Card>
          )}

          <SubmissionHistory attempts={attempts} dueAt={assignment.due_at} maxScore={assignment.max_score} viewer="staff" />
          {attempts.length > 1 && (
            <ul className="grid gap-1 text-sm">
              {attempts.map((a) => (
                <li key={a.id}>
                  {a.id === submission.id ? (
                    <span className="font-medium">{t("Attempt {attempt} (shown)", { attempt: a.attempt })}</span>
                  ) : (
                    <Link href={submissionPath(assignment.id, a.id)} className="hover:underline">
                      {t("Open attempt {attempt}", { attempt: a.attempt })}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {submission.student && (
            <Link href={studentPath(submission.student.id, "assignments")} className="text-muted-foreground text-sm hover:underline">
              {t("All of {full_name}'s assignments", { full_name: submission.student.full_name })}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
