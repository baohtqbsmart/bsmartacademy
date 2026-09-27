import { ArrowLeftIcon, CircleCheckIcon, PencilIcon, SendIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentEditPath, assignmentWorkPath, routes, submissionPath } from "@/config/routes"
import { returnGradesAction } from "@/features/assignments/actions"
import { AssignmentStatusBadge, WorkStatusBadge } from "@/features/assignments/components/badges"
import { FileList } from "@/features/assignments/components/file-list"
import { FileUploader } from "@/features/assignments/components/file-uploader"
import { LifecycleActions } from "@/features/assignments/components/lifecycle-actions"
import { DeleteQuestionButton, QuestionDialog } from "@/features/assignments/components/question-editor"
import { StartWorkButton } from "@/features/assignments/components/start-work-button"
import { AttemptAnswers, SubmissionHistory } from "@/features/assignments/components/submission-view"
import { getAnswerKeys, getAssignment, type AssignmentDetail } from "@/features/assignments/server/assignment-service"
import { listAttempts, listSubmissionRoster, type Attempt } from "@/features/assignments/server/submission-service"
import {
  ASSIGNMENT_TYPE_LABELS,
  formatScore,
  QUESTION_KIND_LABELS,
  SKILL_LABELS,
  workStatus,
} from "@/features/assignments/status"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { UPLOAD_RULES } from "@/lib/uploads"

export const metadata: Metadata = { title: "Assignment" }

export default async function AssignmentPage({ params, searchParams }: PageProps<"/assignments/[id]">) {
  const user = await requireRouteAccess(routes.assignmentDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  // RLS: drafts, scheduled and archived work only reach the class's editors.
  const assignment = await getAssignment(db, id)
  if (!assignment) notFound()

  // Anyone holding assignments.write who can see the assignment edits it
  // (teachers only see their own classes).
  const isEditor = can(user.permissions, "assignments.write")
  const isStudent = can(user.permissions, "submissions.write", ["own"])

  return (
    <>
      <Link href={routes.assignments} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Assignments
      </Link>
      <PageHeader
        title={assignment.title}
        description={[assignment.class?.name, assignment.class?.course?.name, assignment.class?.course?.level?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            <AssignmentStatusBadge status={assignment.state} />
            {isEditor && assignment.state !== "archived" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={assignmentEditPath(assignment.id)}>
                  <PencilIcon aria-hidden /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isEditor && (
        <div className="grid gap-2">
          <LifecycleActions
            assignmentId={assignment.id}
            state={assignment.state}
            publishAt={assignment.publish_at}
            canDelete={assignment.state === "draft" && assignment.published_at === null}
          />
          {assignment.state === "scheduled" && (
            <p className="text-muted-foreground text-sm">Students will see it from {formatDateTime(assignment.publish_at)}.</p>
          )}
        </div>
      )}

      <Details assignment={assignment} />

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          {assignment.description && <CardDescription className="whitespace-pre-wrap">{assignment.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm whitespace-pre-wrap">{assignment.instructions || "No instructions."}</p>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Attachments</span>
            <FileList
              files={assignment.attachments}
              removable={isEditor && assignment.state !== "archived" ? "attachment" : undefined}
              empty="No attachments."
            />
            {isEditor && assignment.state !== "archived" && (
              <FileUploader
                target={{ kind: "assignment", assignmentId: assignment.id }}
                remaining={UPLOAD_RULES.maxAttachmentsPerAssignment - assignment.attachments.length}
                label="Attach files"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {isEditor ? (
        <TeacherSections assignmentId={assignment.id} assignment={assignment} />
      ) : isStudent ? (
        <StudentSection assignment={assignment} submittedId={uuidParam(await searchParams, "submitted")} />
      ) : (
        <FamilySection assignment={assignment} />
      )}
    </>
  )
}

function Details({ assignment }: { assignment: AssignmentDetail }) {
  const items = [
    ["Type", ASSIGNMENT_TYPE_LABELS[assignment.assignment_type]],
    ["Skill", assignment.skill ? SKILL_LABELS[assignment.skill] : "—"],
    ["Due", formatDateTime(assignment.due_at)],
    ["Time limit", assignment.time_limit_minutes ? `${assignment.time_limit_minutes} minutes` : "None"],
    ["Maximum score", String(Number(assignment.max_score))],
    ["Late work", assignment.allow_late ? "Accepted (marked late)" : "Not accepted"],
    ["File upload", assignment.requires_file ? "Required" : "Optional"],
    ["Set by", assignment.created_by_name || "—"],
  ]
  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-sm">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Teachers: questions with answer keys, and the class's submissions
// ---------------------------------------------------------------------------

async function TeacherSections({ assignmentId, assignment }: { assignmentId: string; assignment: AssignmentDetail }) {
  const db = await createClient()
  const [keys, roster, started] = await Promise.all([
    getAnswerKeys(db, assignment.questions.map((q) => q.id)),
    assignment.class ? listSubmissionRoster(db, assignmentId, assignment.class.id) : [],
    db.from("submissions").select("id", { count: "exact", head: true }).eq("assignment_id", assignmentId),
  ])
  // The database freezes questions once any student has started.
  const locked = (started.count ?? 0) > 0 || assignment.state === "archived"
  const graded = roster.filter((r) => r.attempt?.status === "graded").length

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            {locked
              ? "Students have started, so questions can no longer change."
              : "Optional. Multiple-choice and short answers are auto-marked as a suggestion; you always set the score."}
          </CardDescription>
          {!locked && (
            <CardAction>
              <QuestionDialog assignmentId={assignmentId} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {assignment.questions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No questions: students answer in writing and/or with files.</p>
          ) : (
            <ol className="grid gap-4">
              {assignment.questions.map((q, index) => {
                const key = keys.get(q.id)
                return (
                  <li key={q.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="grid gap-1">
                      <p className="font-medium whitespace-pre-wrap">
                        {index + 1}. {q.prompt}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {QUESTION_KIND_LABELS[q.kind]} · {Number(q.points)} pt
                      </p>
                      {q.options && (
                        <ul className="grid gap-0.5">
                          {q.options.map((option, i) => (
                            <li key={i} className={key?.correct_option === i ? "font-medium" : undefined}>
                              {String.fromCharCode(65 + i)}. {option}
                              {key?.correct_option === i && (
                                <CircleCheckIcon className="ml-1 inline size-3.5 text-[#006300] dark:text-[#0ca30c]" aria-label="Correct answer" />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.kind === "short_answer" && key?.accepted_answers && (
                        <p className="text-muted-foreground">Accepted: {key.accepted_answers.join(" / ")}</p>
                      )}
                      {key?.explanation && <p className="text-muted-foreground">Notes: {key.explanation}</p>}
                    </div>
                    {!locked && (
                      <div className="flex shrink-0 gap-1">
                        <QuestionDialog
                          assignmentId={assignmentId}
                          initial={{
                            questionId: q.id,
                            kind: q.kind,
                            prompt: q.prompt,
                            options: q.options ?? ["", ""],
                            points: String(Number(q.points)),
                            correctOption: key?.correct_option ?? null,
                            acceptedAnswers: key?.accepted_answers?.join("\n") ?? "",
                            explanation: key?.explanation ?? "",
                          }}
                        />
                        <DeleteQuestionButton questionId={q.id} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Submissions</h2>
          {graded > 0 && (
            <ConfirmActionButton
              title={`Return ${graded} grade${graded === 1 ? "" : "s"}?`}
              description="Students and parents will see the scores and feedback."
              confirmLabel="Return grades"
              successMessage="Grades returned."
              action={returnGradesAction.bind(null, { assignmentId })}
            >
              <SendIcon aria-hidden /> Return all graded ({graded})
            </ConfirmActionButton>
          )}
        </div>
        <SimpleTable
          rows={roster}
          rowKey={(r) => r.student.id}
          empty={<EmptyState icon={UsersIcon} title="No students in this class" />}
          columns={[
            { header: "Student", cell: (r) => <span className="font-medium">{r.student.full_name}</span> },
            { header: "Status", cell: (r) => <WorkStatusBadge status={workStatus(r.attempt, assignment.due_at, "staff")} /> },
            { header: "Attempt", cell: (r) => (r.attempt ? r.attempt.attempt : "—") },
            { header: "Handed in", cell: (r) => <span className="tabular-nums">{formatDateTime(r.attempt?.submitted_at)}</span> },
            {
              header: "Score",
              cell: (r) =>
                r.grade ? (
                  <span className="tabular-nums">
                    {formatScore(r.grade.score, assignment.max_score)}
                    {!r.grade.returned_at && <span className="text-muted-foreground"> · not returned</span>}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              header: "",
              key: "open",
              cell: (r) =>
                r.attempt && r.attempt.status !== "in_progress" ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={submissionPath(assignmentId, r.attempt.id)}>{r.attempt.status === "submitted" ? "Grade" : "Open"}</Link>
                  </Button>
                ) : null,
            },
          ]}
        />
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Students: start / continue, confirmation, returned grade, history
// ---------------------------------------------------------------------------

async function StudentSection({ assignment, submittedId }: { assignment: AssignmentDetail; submittedId?: string }) {
  const attempts = await listAttempts(await createClient(), assignment.id)
  const latest = attempts.at(-1) ?? null
  const status = workStatus(latest, assignment.due_at, "family")
  const open = assignment.state === "published"
  const tooLate = !assignment.allow_late && assignment.due_at !== null && new Date(assignment.due_at) < new Date()
  const confirmed = submittedId ? attempts.find((a) => a.id === submittedId && a.submitted_at) : undefined

  let action: React.ReactNode = null
  if (latest?.status === "in_progress") {
    action = (
      <Button asChild>
        <Link href={assignmentWorkPath(assignment.id)}>Continue working</Link>
      </Button>
    )
  } else if (!open) {
    action = <p className="text-muted-foreground text-sm">This assignment is closed.</p>
  } else if (!latest) {
    action = tooLate ? (
      <p className="text-muted-foreground text-sm">The due date has passed and late work is not accepted.</p>
    ) : (
      <StartWorkButton assignmentId={assignment.id} label="Start" />
    )
  } else if (latest.resubmission_allowed) {
    action = <StartWorkButton assignmentId={assignment.id} label="Start a new attempt" />
  }

  return (
    <>
      {confirmed && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Submitted</AlertTitle>
          <AlertDescription>
            Your work was handed in on {formatDateTime(confirmed.submitted_at)}
            {confirmed.is_late && " (after the due date)"}. Reference: {confirmed.id.slice(0, 8).toUpperCase()}.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Your work <WorkStatusBadge status={status} />
          </CardTitle>
          {latest?.submitted_at && (
            <CardDescription>
              Handed in {formatDateTime(latest.submitted_at)}
              {latest.status !== "returned" && " · you cannot change it unless your teacher allows a resubmission"}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <ReturnedGrade attempts={attempts} maxScore={assignment.max_score} />
          {action && <div>{action}</div>}
        </CardContent>
      </Card>
      {attempts.some((a) => a.status !== "in_progress") && (
        <AttemptsReview attempts={attempts} assignment={assignment} viewer="family" />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Parents (and read-only viewers): each child's work
// ---------------------------------------------------------------------------

async function FamilySection({ assignment }: { assignment: AssignmentDetail }) {
  const attempts = await listAttempts(await createClient(), assignment.id)
  const byStudent = new Map<string, Attempt[]>()
  for (const a of attempts) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a])

  if (byStudent.size === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={UsersIcon} title="Nothing handed in yet" />
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      {[...byStudent.values()].map((list) => (
        <Card key={list[0].student_id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {list[0].student?.full_name}
              <WorkStatusBadge status={workStatus(list.at(-1)!, assignment.due_at, "family")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ReturnedGrade attempts={list} maxScore={assignment.max_score} />
            <AttemptsReview attempts={list} assignment={assignment} viewer="family" />
          </CardContent>
        </Card>
      ))}
    </>
  )
}

/** The most recent returned grade (RLS only returns grades that were returned). */
function ReturnedGrade({ attempts, maxScore }: { attempts: Attempt[]; maxScore: number }) {
  const graded = [...attempts].reverse().find((a) => a.submission_grades?.returned_at)
  if (!graded?.submission_grades) return null
  const grade = graded.submission_grades
  return (
    <div className="grid gap-1 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{formatScore(grade.score, maxScore)}</span>
        <Badge variant="secondary">Attempt {graded.attempt}</Badge>
      </div>
      {grade.feedback && <p className="text-sm whitespace-pre-wrap">{grade.feedback}</p>}
      <p className="text-muted-foreground text-xs">
        {grade.graded_by_name} · returned {formatDateTime(grade.returned_at)}
      </p>
    </div>
  )
}

function AttemptsReview({
  attempts,
  assignment,
  viewer,
}: {
  attempts: Attempt[]
  assignment: AssignmentDetail
  viewer: "staff" | "family"
}) {
  return (
    <>
      <SubmissionHistory attempts={attempts} dueAt={assignment.due_at} maxScore={assignment.max_score} viewer={viewer} />
      {attempts
        .filter((a) => a.status !== "in_progress")
        .reverse()
        .map((attempt) => (
          <details key={attempt.id} className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">What was handed in — attempt {attempt.attempt}</summary>
            <div className="mt-3">
              <AttemptAnswers attempt={attempt} questions={assignment.questions} />
            </div>
          </details>
        ))}
    </>
  )
}
