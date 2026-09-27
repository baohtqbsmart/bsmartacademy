"use client"

import { SaveIcon, SendIcon, TimerIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { saveWorkAction, submitWorkAction } from "@/features/assignments/actions"
import { FileList } from "@/features/assignments/components/file-list"
import { FileUploader } from "@/features/assignments/components/file-uploader"
import type { QuestionKind } from "@/features/assignments/status"
import { assignmentPath } from "@/config/routes"
import { formatDateTime } from "@/lib/format"
import { UPLOAD_RULES } from "@/lib/uploads"

type Answer = { choice?: number; text?: string }

type WorkFormProps = {
  assignmentId: string
  submission: {
    id: string
    attempt: number
    answers: Record<string, Answer>
    response_text: string | null
    deadline_at: string | null
  }
  questions: { id: string; position: number; kind: QuestionKind; prompt: string; options: string[] | null; points: number }[]
  files: { id: string; file_name: string; size_bytes: number; url: string | null }[]
  requiresFile: boolean
}

export function WorkForm({ assignmentId, submission, questions, files, requiresFile }: WorkFormProps) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, Answer>>(submission.answers)
  const [responseText, setResponseText] = useState(submission.response_text ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const timeLeft = useTimeLeft(submission.deadline_at)
  const timeUp = timeLeft !== null && timeLeft <= 0

  const answered = questions.filter((q) => {
    const a = answers[q.id]
    return a && (a.choice !== undefined || (a.text ?? "").trim() !== "")
  }).length

  const save = () =>
    saveWorkAction({
      submissionId: submission.id,
      // Empty text answers are left out.
      answers: Object.fromEntries(Object.entries(answers).filter(([, a]) => a.choice !== undefined || (a.text ?? "").trim() !== "")),
      responseText,
    })

  function saveDraft() {
    setError(null)
    startTransition(async () => {
      const result = await save()
      if (result.ok) toast.success("Your work is saved. You can come back and finish it later.")
      else setError(result.error.message)
    })
  }

  function handIn() {
    setError(null)
    startTransition(async () => {
      if (!timeUp) {
        const saved = await save()
        if (!saved.ok) {
          setError(saved.error.message)
          return
        }
      }
      const result = await submitWorkAction({ submissionId: submission.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      router.push(`${assignmentPath(assignmentId)}?submitted=${submission.id}`)
    })
  }

  return (
    <div className="grid gap-4">
      {submission.deadline_at && (
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <TimerIcon className="size-4" aria-hidden />
          {timeUp
            ? "Time is up. Your saved answers can still be handed in."
            : `Hand in by ${formatDateTime(submission.deadline_at)} (${Math.ceil((timeLeft ?? 0) / 60000)} min left).`}
        </p>
      )}

      {questions.length > 0 && (
        <ol className="grid gap-3">
          {questions.map((q, index) => (
            <li key={q.id}>
              <Card className="gap-0 py-4">
                <CardContent className="grid gap-3 px-4">
                  <div className="flex justify-between gap-2">
                    <p id={`q-${q.id}`} className="font-medium whitespace-pre-wrap">
                      {index + 1}. {q.prompt}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {Number(q.points)} pt{Number(q.points) === 1 ? "" : "s"}
                    </span>
                  </div>
                  {q.kind === "multiple_choice" ? (
                    <div role="radiogroup" aria-labelledby={`q-${q.id}`} className="grid gap-1">
                      {(q.options ?? []).map((option, i) => (
                        <label key={i} className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            className="accent-primary size-4"
                            checked={answers[q.id]?.choice === i}
                            disabled={timeUp}
                            onChange={() => setAnswers((c) => ({ ...c, [q.id]: { choice: i } }))}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : q.kind === "short_answer" ? (
                    <Input
                      aria-labelledby={`q-${q.id}`}
                      value={answers[q.id]?.text ?? ""}
                      maxLength={5000}
                      disabled={timeUp}
                      onChange={(e) => setAnswers((c) => ({ ...c, [q.id]: { text: e.target.value } }))}
                    />
                  ) : (
                    <Textarea
                      aria-labelledby={`q-${q.id}`}
                      rows={5}
                      value={answers[q.id]?.text ?? ""}
                      maxLength={5000}
                      disabled={timeUp}
                      onChange={(e) => setAnswers((c) => ({ ...c, [q.id]: { text: e.target.value } }))}
                    />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-2">
        <Label htmlFor="response-text">{questions.length > 0 ? "Anything else for your teacher (optional)" : "Your answer"}</Label>
        <Textarea
          id="response-text"
          rows={questions.length > 0 ? 3 : 8}
          value={responseText}
          maxLength={20000}
          disabled={timeUp}
          onChange={(e) => setResponseText(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Files{requiresFile && " (required)"}</span>
        <FileList files={files} removable="submission" empty={requiresFile ? "Upload at least one file." : "No files yet."} />
        <FileUploader
          target={{ kind: "submission", submissionId: submission.id }}
          remaining={UPLOAD_RULES.maxFilesPerSubmission - files.length}
        />
      </div>

      <FormAlert message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={saveDraft} disabled={isPending || timeUp}>
          <SaveIcon aria-hidden /> Save draft
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={isPending}>
              <SendIcon aria-hidden /> Submit
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hand in your work?</AlertDialogTitle>
              <AlertDialogDescription>
                {questions.length > 0 && `You have answered ${answered} of ${questions.length} questions. `}
                After submitting you cannot change your work unless your teacher allows a resubmission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={handIn}>Submit</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <span className="text-muted-foreground text-sm">Attempt {submission.attempt}</span>
      </div>
    </div>
  )
}

/** Milliseconds until `deadline`, updated every 15 s; null without a deadline. */
function useTimeLeft(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [deadline])
  return deadline ? new Date(deadline).getTime() - now : null
}
