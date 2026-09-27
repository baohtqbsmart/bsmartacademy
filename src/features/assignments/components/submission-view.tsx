import { CircleCheckIcon, CircleXIcon, HistoryIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkStatusBadge } from "@/features/assignments/components/badges"
import { FileList } from "@/features/assignments/components/file-list"
import type { AnswerKey, AssignmentDetail } from "@/features/assignments/server/assignment-service"
import type { Attempt } from "@/features/assignments/server/submission-service"
import { formatScore, workStatus } from "@/features/assignments/status"
import { formatDateTime } from "@/lib/format"
import type { Enums } from "@/types/database"

type Mark = { correct: boolean | null; earned: number; points: number }

/**
 * One attempt: answers per question, files, and (for teachers) the answer key
 * and auto-marks. Students see grades only once they are returned (RLS).
 */
export function AttemptAnswers({
  attempt,
  questions,
  keys,
  marks,
}: {
  attempt: Attempt
  questions: AssignmentDetail["questions"]
  keys?: Map<string, AnswerKey>
  marks?: Map<string, Mark>
}) {
  return (
    <div className="grid gap-3">
      {questions.length > 0 && (
        <ol className="grid gap-3">
          {questions.map((q, index) => {
            const answer = attempt.answers[q.id]
            const key = keys?.get(q.id)
            const mark = marks?.get(q.id)
            const given =
              q.kind === "multiple_choice"
                ? answer?.choice !== undefined
                  ? q.options?.[answer.choice]
                  : undefined
                : answer?.text
            return (
              <li key={q.id} className="grid gap-1 text-sm">
                <p className="font-medium whitespace-pre-wrap">
                  {index + 1}. {q.prompt} <span className="text-muted-foreground font-normal">({Number(q.points)} pt)</span>
                </p>
                <p className="flex items-start gap-2">
                  {mark?.correct === true && <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-[#006300] dark:text-[#0ca30c]" aria-label="Correct" />}
                  {mark?.correct === false && <CircleXIcon className="mt-0.5 size-4 shrink-0 text-[#b02a2a] dark:text-[#ef7b7b]" aria-label="Incorrect" />}
                  <span className={given ? "whitespace-pre-wrap" : "text-muted-foreground italic"}>{given || "No answer"}</span>
                </p>
                {key && (
                  <p className="text-muted-foreground">
                    Key:{" "}
                    {q.kind === "multiple_choice" && key.correct_option !== null
                      ? q.options?.[key.correct_option]
                      : q.kind === "short_answer"
                        ? key.accepted_answers?.join(" / ")
                        : key.explanation ?? "—"}
                    {q.kind !== "long_answer" && key.explanation && ` — ${key.explanation}`}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {attempt.response_text && (
        <div className="grid gap-1 text-sm">
          <span className="font-medium">{questions.length > 0 ? "Note / answer" : "Answer"}</span>
          <p className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap">{attempt.response_text}</p>
        </div>
      )}
      <div className="grid gap-1 text-sm">
        <span className="font-medium">Files</span>
        <FileList files={attempt.files} />
      </div>
    </div>
  )
}

const EVENT_LABELS: Record<Enums<"submission_event">, string> = {
  started: "Started",
  submitted: "Submitted",
  graded: "Graded",
  returned: "Grade returned",
  resubmission_allowed: "Resubmission allowed",
  resubmission_revoked: "Resubmission withdrawn",
}

/** Every attempt with its timeline (the submission history). */
export function SubmissionHistory({
  attempts,
  dueAt,
  maxScore,
  viewer,
}: {
  attempts: Attempt[]
  dueAt: string | null
  maxScore: number
  viewer: "staff" | "family"
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4" aria-hidden /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        ) : (
          <ol className="grid gap-4">
            {[...attempts].reverse().map((attempt) => {
              // RLS hides "graded" events from students and parents until the grade is returned.
              const events = [...attempt.submission_events].sort((a, b) => a.created_at.localeCompare(b.created_at))
              return (
                <li key={attempt.id} className="grid gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Attempt {attempt.attempt}</span>
                    <WorkStatusBadge status={workStatus(attempt, dueAt, viewer)} />
                    {attempt.submission_grades && (viewer === "staff" || attempt.submission_grades.returned_at) && (
                      <span className="tabular-nums">{formatScore(attempt.submission_grades.score, maxScore)}</span>
                    )}
                  </div>
                  <ul className="text-muted-foreground grid gap-0.5 border-l pl-3">
                    {events.map((e) => (
                      <li key={e.id}>
                        <span className="tabular-nums">{formatDateTime(e.created_at)}</span> · {EVENT_LABELS[e.event]}
                        {e.detail && viewer === "staff" && ` (${e.detail})`}
                        {e.detail === "Late" && viewer === "family" && " (late)"}
                        {e.actor_name && ` · ${e.actor_name}`}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
