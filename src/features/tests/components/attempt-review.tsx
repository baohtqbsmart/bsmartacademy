import { CircleAlertIcon, CircleCheckIcon, CircleMinusIcon, CircleXIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { GradeAnswerForm } from "@/features/tests/components/grade-answer-form"
import { asContent, asKey, asResponse, describeKey, describeResponse, QUESTION_TYPE_LABELS } from "@/features/tests/questions"
import type { AttemptDetail } from "@/features/tests/server/attempt-service"

/**
 * An attempt question by question. Marks, feedback and correct answers are
 * only present when the database returned them (teachers, or the review policy).
 */
export function AttemptReview({ rows, attemptId, canGrade }: { rows: AttemptDetail[]; attemptId: string; canGrade: boolean }) {
  return (
    <ol className="grid gap-3">
      {rows.map((row, index) => {
        const content = asContent(row.content)
        const given = describeResponse(row.question_type, content, asResponse(row.response))
        const key = row.correct_answer ? describeKey(row.question_type, content, asKey(row.correct_answer)) : null
        const mark = row.manual_score ?? row.auto_score
        return (
          <li key={row.test_question_id}>
            <Card className="gap-0 py-4">
              <CardContent className="grid gap-2 px-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium">
                    {index + 1}. <span className="font-normal whitespace-pre-wrap">{row.prompt}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{QUESTION_TYPE_LABELS[row.question_type]}</Badge>
                    {row.review_open && <MarkBadge mark={mark} points={row.points} needsReview={Boolean(row.needs_review) && row.manual_score === null} />}
                    {!row.review_open && <span className="text-muted-foreground tabular-nums">{row.points} pt</span>}
                  </span>
                </div>
                {content.source_text && <p className="bg-muted/50 rounded-md px-3 py-2 italic">{content.source_text}</p>}
                {row.mediaUrl && row.question_type === "listening" && <audio controls src={row.mediaUrl} className="w-full max-w-md" />}
                <p>
                  <span className="text-muted-foreground">Answer: </span>
                  {given ? <span className="whitespace-pre-wrap">{given}</span> : <span className="text-muted-foreground italic">No answer</span>}
                </p>
                {row.recordingUrl && <audio controls src={row.recordingUrl} className="w-full max-w-md" />}
                {key && (
                  <p>
                    <span className="text-muted-foreground">Correct answer: </span>
                    {key}
                  </p>
                )}
                {row.explanation && <p className="text-muted-foreground whitespace-pre-wrap">{row.explanation}</p>}
                {row.feedback && (
                  <p className="border-l-2 pl-3 whitespace-pre-wrap">
                    <span className="text-muted-foreground">Teacher: </span>
                    {row.feedback}
                  </p>
                )}
                {canGrade && (
                  <GradeAnswerForm
                    attemptId={attemptId}
                    questionId={row.test_question_id}
                    points={row.points}
                    initialScore={mark}
                    initialFeedback={row.feedback}
                    needsReview={Boolean(row.needs_review) && row.manual_score === null}
                  />
                )}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ol>
  )
}

/** Status icon + label (never colour alone). */
function MarkBadge({ mark, points, needsReview }: { mark: number | null; points: number; needsReview: boolean }) {
  if (needsReview) {
    return (
      <Badge variant="outline" className="gap-1 border-transparent bg-[#fab219]/20">
        <CircleAlertIcon className="size-3" aria-hidden /> To mark · {points} pt
      </Badge>
    )
  }
  const value = mark ?? 0
  const [Icon, label, className] =
    value >= points
      ? [CircleCheckIcon, "Correct", "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]"]
      : value > 0
        ? [CircleMinusIcon, "Partly correct", "border-transparent bg-[#fab219]/20"]
        : [CircleXIcon, "Incorrect", "border-transparent bg-[#d03b3b]/12 text-[#b02a2a] dark:text-[#ef7b7b]"]
  return (
    <Badge variant="outline" className={`gap-1 tabular-nums ${className}`}>
      <Icon className="size-3" aria-hidden /> {label} · {value} / {points}
    </Badge>
  )
}
