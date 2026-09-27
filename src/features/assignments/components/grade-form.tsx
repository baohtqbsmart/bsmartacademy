"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { gradeSubmissionAction } from "@/features/assignments/actions"
import { useT } from "@/i18n/client"

type GradeFormProps = {
  submissionId: string
  maxScore: number
  initial: { score: number | null; feedback: string | null }
  returned: boolean
  /** Points earned on auto-marked questions, scaled to the maximum score. */
  suggestion: number | null
}

/** Score + feedback; "Save" keeps the grade private, "Save and return" publishes it. */
export function GradeForm({ submissionId, maxScore, initial, returned, suggestion }: GradeFormProps) {
  const t = useT()
  const [score, setScore] = useState(initial.score === null ? "" : String(Number(initial.score)))
  const [feedback, setFeedback] = useState(initial.feedback ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(publish: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await gradeSubmissionAction({ submissionId, score, feedback, publish })
      if (result.ok) toast.success(t(publish || returned ? "Grade saved and visible to the student." : "Grade saved (not yet visible to the student)."))
      else setError(result.error.message)
    })
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-2">
        <Label htmlFor="grade-score">{t("Score (out of {maxScore})", { maxScore })}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="grade-score" inputMode="decimal" className="w-28" value={score} onChange={(e) => setScore(e.target.value)} />
          {suggestion !== null && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setScore(String(suggestion))}>
              {t("Use auto-mark suggestion ({suggestion})", { suggestion })}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="grade-feedback">{t("Feedback for the student")}</Label>
        <Textarea id="grade-feedback" rows={5} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
      <FormAlert message={error} />
      <div className="flex flex-wrap gap-2">
        {returned ? (
          <Button type="button" disabled={isPending} onClick={() => save(true)}>
            {t("Update grade")}
          </Button>
        ) : (
          <>
            <Button type="button" disabled={isPending} onClick={() => save(true)}>
              {t("Save and return to student")}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => save(false)}>
              {t("Save without returning")}
            </Button>
          </>
        )}
      </div>
      {returned && <p className="text-muted-foreground text-xs">{t("This grade has been returned; changes are visible to the student straight away.")}</p>}
    </form>
  )
}
