"use client"

import { CheckIcon, Loader2Icon, SendIcon, TimerIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"

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
import { Textarea } from "@/components/ui/textarea"
import { FileUploader } from "@/features/assignments/components/file-uploader"
import { saveAnswerAction, submitAttemptAction } from "@/features/tests/actions"
import {
  asContent,
  isAnswered,
  optionOrder,
  splitBlanks,
  type QuestionType,
  type Response,
} from "@/features/tests/questions"
import { formatDateTime } from "@/lib/format"
import type { Json } from "@/types/database"

export type TakeQuestion = {
  id: string
  question_type: QuestionType
  prompt: string
  content: Json
  points: number
  mediaUrl: string | null
}

type TakeTestProps = {
  testId: string
  attemptId: string
  attemptNumber: number
  deadline: string | null
  optionOrders: Json
  questions: TakeQuestion[]
  initialResponses: Record<string, Json | null>
}

type SaveState = "idle" | "saving" | "saved" | "error"

export function TakeTest({ testId, attemptId, attemptNumber, deadline, optionOrders, questions, initialResponses }: TakeTestProps) {
  const [responses, setResponses] = useState<Record<string, Response>>(
    () => Object.fromEntries(Object.entries(initialResponses).map(([id, r]) => [id, (r ?? {}) as Response]))
  )
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, startSubmit] = useTransition()
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pending = useRef<Record<string, Response>>({})

  const persist = useCallback(
    async (questionId: string) => {
      const response = pending.current[questionId]
      if (!response) return true
      delete pending.current[questionId]
      setSaveState((s) => ({ ...s, [questionId]: "saving" }))
      const result = await saveAnswerAction({ attemptId, questionId, response })
      setSaveState((s) => ({ ...s, [questionId]: result.ok ? "saved" : "error" }))
      if (!result.ok) setError(result.error.message)
      return result.ok
    },
    [attemptId]
  )

  function update(questionId: string, response: Response) {
    setResponses((r) => ({ ...r, [questionId]: response }))
    pending.current[questionId] = response
    clearTimeout(timers.current[questionId])
    timers.current[questionId] = setTimeout(() => void persist(questionId), 700)
  }

  const handIn = useCallback(() => {
    setError(null)
    startSubmit(async () => {
      for (const id of Object.keys(pending.current)) {
        clearTimeout(timers.current[id])
        await persist(id)
      }
      const result = await submitAttemptAction({ attemptId, testId })
      if (result && !result.ok) setError(result.error.message)
    })
  }, [attemptId, testId, persist])

  // Countdown; hands the attempt in when time runs out.
  const timeLeft = useTimeLeft(deadline)
  const handedIn = useRef(false)
  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 0 && !handedIn.current) {
      handedIn.current = true
      handIn()
    }
  }, [timeLeft, handIn])

  const answered = questions.filter((q) => isAnswered(responses[q.id])).length

  return (
    <div className="grid gap-4">
      <div className="bg-background/95 sticky top-[env(safe-area-inset-top,0px)] z-10 flex flex-wrap items-center justify-between gap-2 border-b py-2 backdrop-blur">
        <span className="text-sm tabular-nums">
          Attempt {attemptNumber} · {answered} of {questions.length} answered
        </span>
        {deadline && (
          <span className={`flex items-center gap-1 text-sm font-medium tabular-nums ${timeLeft !== null && timeLeft < 60_000 ? "text-[#b02a2a] dark:text-[#ef7b7b]" : ""}`} aria-live="polite">
            <TimerIcon className="size-4" aria-hidden />
            {timeLeft !== null && timeLeft > 0 ? formatCountdown(timeLeft) : "Time is up"}
            <span className="text-muted-foreground font-normal"> · ends {formatDateTime(deadline)}</span>
          </span>
        )}
      </div>

      <nav aria-label="Questions" className="flex flex-wrap gap-1">
        {questions.map((q, i) => (
          <a
            key={q.id}
            href={`#question-${i + 1}`}
            className={`flex size-8 items-center justify-center rounded-md border text-xs tabular-nums ${isAnswered(responses[q.id]) ? "bg-muted font-medium" : ""}`}
            aria-label={`Question ${i + 1}${isAnswered(responses[q.id]) ? " (answered)" : ""}`}
          >
            {i + 1}
          </a>
        ))}
      </nav>

      <ol className="grid gap-3">
        {questions.map((q, index) => (
          <li key={q.id} id={`question-${index + 1}`} className="scroll-mt-20">
            <Card className="gap-0 py-4">
              <CardContent className="grid gap-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <span id={`label-${q.id}`} className="font-medium">
                    Question {index + 1}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                    <SaveIndicator state={saveState[q.id]} />
                    {Number(q.points)} pt{Number(q.points) === 1 ? "" : "s"}
                  </span>
                </div>
                <QuestionInput
                  question={q}
                  order={optionOrder(optionOrders, q.id, (asContent(q.content).options ?? asContent(q.content).right ?? []).length)}
                  response={responses[q.id] ?? {}}
                  onChange={(r) => update(q.id, r)}
                  attemptId={attemptId}
                  saved={(initialResponses[q.id] ?? {}) as Response}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <FormAlert message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isSubmitting}>
              {isSubmitting ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />} Submit test
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hand in your test?</AlertDialogTitle>
              <AlertDialogDescription>
                You have answered {answered} of {questions.length} questions. After submitting you cannot change your answers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={handIn}>Submit</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <span className="text-muted-foreground text-sm">Answers are saved as you go.</span>
      </div>
    </div>
  )
}

function SaveIndicator({ state }: { state?: SaveState }) {
  if (state === "saving") return <Loader2Icon className="size-3 animate-spin" aria-label="Saving" />
  if (state === "saved") return <CheckIcon className="size-3" aria-label="Saved" />
  if (state === "error") return <TriangleAlertIcon className="size-3 text-[#b02a2a] dark:text-[#ef7b7b]" aria-label="Not saved" />
  return null
}

/** One question's answer input (shared with English lesson exercises). */
export function QuestionInput({
  question,
  order,
  response,
  onChange,
  attemptId,
  saved,
}: {
  question: TakeQuestion
  order: number[]
  response: Response
  onChange: (response: Response) => void
  attemptId: string
  /** The server's copy (recordings are saved by the upload, not by this form). */
  saved: Response
}) {
  const content = asContent(question.content)
  const type = question.question_type
  const labelledBy = `label-${question.id}`
  const text = (
    <p className="whitespace-pre-wrap">{question.prompt}</p>
  )

  const media = question.mediaUrl ? (
    type === "listening" ? (
      <audio controls src={question.mediaUrl} className="w-full max-w-md" />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={question.mediaUrl} alt="" className="max-h-64 rounded-md border" />
    )
  ) : type === "listening" ? (
    <p className="text-muted-foreground text-sm">No audio has been attached to this question.</p>
  ) : null

  if (type === "multiple_choice" || type === "multiple_response" || (type === "listening" && content.format === "choice")) {
    const multi = type === "multiple_response"
    const options = content.options ?? []
    return (
      <>
        {text}
        {media}
        <div role={multi ? "group" : "radiogroup"} aria-labelledby={labelledBy} className="grid gap-1">
          {multi && <p className="text-muted-foreground text-xs">Choose all that apply.</p>}
          {order.map((i) => (
            <label key={i} className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-sm">
              <input
                type={multi ? "checkbox" : "radio"}
                name={`q-${question.id}`}
                className="accent-primary size-4"
                checked={multi ? (response.choices ?? []).includes(i) : response.choice === i}
                onChange={(e) =>
                  onChange(
                    multi
                      ? { choices: e.target.checked ? [...(response.choices ?? []), i] : (response.choices ?? []).filter((c) => c !== i) }
                      : { choice: i }
                  )
                }
              />
              {options[i]}
            </label>
          ))}
        </div>
      </>
    )
  }

  switch (type) {
    case "true_false":
      return (
        <>
          {text}
          <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-4">
            {[true, false].map((value) => (
              <label key={String(value)} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`q-${question.id}`} className="accent-primary size-4" checked={response.value === value} onChange={() => onChange({ value })} />
                {value ? "True" : "False"}
              </label>
            ))}
          </div>
        </>
      )
    case "matching": {
      const left = content.left ?? []
      const right = content.right ?? []
      const pairs = response.pairs ?? left.map(() => -1)
      return (
        <>
          {text}
          <div className="grid gap-2">
            {left.map((item, i) => (
              <label key={i} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_1fr]">
                <span>{item}</span>
                <select
                  className="border-input bg-background h-9 rounded-md border px-2"
                  value={pairs[i] ?? -1}
                  onChange={(e) => onChange({ pairs: left.map((_, j) => (j === i ? Number(e.target.value) : pairs[j] ?? -1)) })}
                >
                  <option value={-1}>Choose…</option>
                  {order.map((r) => (
                    <option key={r} value={r}>
                      {right[r]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )
    }
    case "fill_blank": {
      const parts = splitBlanks(question.prompt)
      const blanks = response.blanks ?? parts.slice(1).map(() => "")
      return (
        <p className="leading-9">
          {parts.map((part, i) => (
            <span key={i} className="whitespace-pre-wrap">
              {part}
              {i < parts.length - 1 && (
                <Input
                  className="mx-1 inline-block h-8 w-36 align-baseline"
                  aria-label={`Blank ${i + 1}`}
                  maxLength={200}
                  value={blanks[i] ?? ""}
                  onChange={(e) => onChange({ blanks: parts.slice(1).map((_, j) => (j === i ? e.target.value : blanks[j] ?? "")) })}
                />
              )}
            </span>
          ))}
        </p>
      )
    }
    case "speaking":
      return (
        <>
          {text}
          {content.max_seconds && <p className="text-muted-foreground text-xs">Up to {content.max_seconds} seconds.</p>}
          {saved.file ? <p className="text-sm">Uploaded: {saved.file.name}</p> : <p className="text-muted-foreground text-sm">No recording yet.</p>}
          <FileUploader
            target={{ kind: "spoken", attemptId, questionId: question.id }}
            remaining={1}
            label={saved.file ? "Replace recording" : "Upload recording"}
            accept=".mp3,.m4a,.wav,.webm"
          />
        </>
      )
    case "essay": {
      const words = (response.text ?? "").trim().split(/\s+/).filter(Boolean).length
      return (
        <>
          {text}
          <Textarea aria-labelledby={labelledBy} rows={8} maxLength={10000} value={response.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          <p className="text-muted-foreground text-xs tabular-nums">
            {words} words
            {content.min_words && ` · at least ${content.min_words}`}
            {content.max_words && ` · at most ${content.max_words}`}
          </p>
        </>
      )
    }
    default:
      // short answer, sentence transformation, error correction, written listening
      return (
        <>
          {text}
          {media}
          {content.source_text && <p className="bg-muted/50 rounded-md px-3 py-2 italic">{content.source_text}</p>}
          {type === "listening" ? (
            <Textarea aria-labelledby={labelledBy} rows={3} maxLength={10000} value={response.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          ) : (
            <Input aria-labelledby={labelledBy} maxLength={1000} value={response.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          )}
        </>
      )
  }
}

function useTimeLeft(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])
  return deadline ? new Date(deadline).getTime() - now : null
}

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
