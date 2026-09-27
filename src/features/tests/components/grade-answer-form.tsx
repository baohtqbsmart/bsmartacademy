"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { gradeAnswerAction } from "@/features/tests/actions"

/** Marks one answer (or overrides an automatic mark). */
export function GradeAnswerForm({
  attemptId,
  questionId,
  points,
  initialScore,
  initialFeedback,
  needsReview,
}: {
  attemptId: string
  questionId: string
  points: number
  initialScore: number | null
  initialFeedback: string | null
  needsReview: boolean
}) {
  const [open, setOpen] = useState(needsReview)
  const [score, setScore] = useState(initialScore === null ? "" : String(initialScore))
  const [feedback, setFeedback] = useState(initialFeedback ?? "")
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Change mark
        </Button>
      </div>
    )
  }

  return (
    <form
      className="grid gap-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await gradeAnswerAction({ attemptId, questionId, score, feedback })
          if (result.ok) toast.success("Mark saved.")
          else toast.error(result.error.message)
        })
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`score-${questionId}`} className="text-sm font-medium">
          Mark
        </label>
        <Input id={`score-${questionId}`} inputMode="decimal" className="h-8 w-20" value={score} onChange={(e) => setScore(e.target.value)} />
        <span className="text-muted-foreground text-sm">/ {points}</span>
      </div>
      <Textarea rows={2} placeholder="Feedback (optional)" aria-label="Feedback" maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div>
        <Button type="submit" size="sm" disabled={isPending || score.trim() === ""}>
          Save mark
        </Button>
      </div>
    </form>
  )
}
