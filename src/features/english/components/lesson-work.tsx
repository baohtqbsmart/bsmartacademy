"use client"

import { Loader2Icon, SendIcon, UploadIcon } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reviewSubmissionAction, submitLessonPracticeAction, submitLessonWorkAction } from "@/features/english/actions"
import { AudioRecorder, uploadFile } from "@/features/english/components/media"
import type { ResponseMode } from "@/features/english/skills"
import { QuestionInput, type TakeQuestion } from "@/features/tests/components/take-test"
import { asContent, type Response } from "@/features/tests/questions"
import { checkFile } from "@/lib/uploads"

/** Lesson exercises (grammar, reading, listening): answer all, then hand in for marking. */
export function LessonExercises({ lessonId, questions }: { lessonId: string; questions: TakeQuestion[] }) {
  const [responses, setResponses] = useState<Record<string, Response>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await submitLessonPracticeAction({ lessonId, responses })
      if (result && !result.ok) setError(result.error.message)
    })
  }

  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {questions.map((q, index) => (
          <li key={q.id}>
            <Card className="gap-0 py-4">
              <CardContent className="grid gap-3 px-4">
                <span id={`label-${q.id}`} className="font-medium">
                  Exercise {index + 1}
                </span>
                <QuestionInput
                  question={q}
                  order={Array.from({ length: (asContent(q.content).options ?? asContent(q.content).right ?? []).length }, (_, i) => i)}
                  response={responses[q.id] ?? {}}
                  onChange={(r) => setResponses((c) => ({ ...c, [q.id]: r }))}
                  attemptId=""
                  saved={{}}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <FormAlert message={error} />
      <div>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />} Check my answers
        </Button>
      </div>
    </div>
  )
}

/** Hands in writing (text) or speaking / pronunciation (a recording). */
export function WorkSubmission({
  lessonId,
  studentId,
  mode,
  minWords,
  maxWords,
}: {
  lessonId: string
  studentId: string
  mode: ResponseMode
  minWords: number | null
  maxWords: number | null
}) {
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const accept = mode === "audio" ? ".mp3,.m4a,.wav,.webm" : mode === "video" ? ".mp4,.mov" : ".mp3,.m4a,.wav,.webm,.mp4,.mov"

  function choose(chosen: File, url?: string) {
    const check = checkFile(chosen)
    if (!check.ok) {
      toast.error(check.message)
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(chosen)
    setPreview(url ?? URL.createObjectURL(chosen))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const uploaded = file ? { objectPath: await uploadFile(`english/${studentId}`, file), fileName: file.name } : null
        const result = await submitLessonWorkAction({ lessonId, text, file: uploaded })
        if (result && !result.ok) setError(result.error.message)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="grid gap-3">
      {mode === "text" ? (
        <div className="grid gap-2">
          <Label htmlFor="work-text">Your writing</Label>
          <Textarea id="work-text" rows={10} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
          <p className={`text-xs tabular-nums ${(minWords && words < minWords) || (maxWords && words > maxWords) ? "text-[#b02a2a] dark:text-[#ef7b7b]" : "text-muted-foreground"}`}>
            {words} words{minWords && ` · at least ${minWords}`}
            {maxWords && ` · at most ${maxWords}`}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Your recording</span>
          <div className="flex flex-wrap items-center gap-2">
            {mode !== "video" && <AudioRecorder maxSeconds={180} onRecorded={(f, url) => choose(f, url)} />}
            <input
              ref={input}
              type="file"
              accept={accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                e.target.value = ""
                if (chosen) choose(chosen)
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              <UploadIcon aria-hidden /> Upload a file
            </Button>
          </div>
          {preview && file && (file.type.startsWith("video/") ? <video controls src={preview} className="max-h-64 w-full max-w-md rounded-md" /> : <audio controls src={preview} className="w-full max-w-md" />)}
          <p className="text-muted-foreground text-xs">Up to 20 MB. Recordings are only visible to you, your parents and your teachers.</p>
          {mode !== "audio" && (
            <div className="grid gap-2">
              <Label htmlFor="work-note">Note for your teacher (optional)</Label>
              <Input id="work-note" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
        </div>
      )}
      <FormAlert message={error} />
      <div>
        <Button onClick={submit} disabled={isPending || (mode === "text" ? words === 0 : !file)}>
          {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />} Hand in
        </Button>
      </div>
    </div>
  )
}

/** Teacher feedback: a score per rubric criterion (or one score) and comments. */
export function ReviewForm({
  submissionId,
  rubric,
  maxScore,
  initial,
}: {
  submissionId: string
  rubric: { criterion: string; description?: string; max_points: number }[]
  maxScore: number
  initial: { feedback: string; scores: number[] | null; score: number | null }
}) {
  const [feedback, setFeedback] = useState(initial.feedback)
  const [scores, setScores] = useState<string[]>(rubric.map((_, i) => (initial.scores?.[i] !== undefined ? String(initial.scores[i]) : "")))
  const [score, setScore] = useState(initial.score === null ? "" : String(initial.score))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const total = scores.reduce((sum, s) => sum + (Number(s.replace(",", ".")) || 0), 0)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await reviewSubmissionAction({
        submissionId,
        feedback,
        rubricScores: rubric.length ? scores.map((s) => Number(s.replace(",", "."))) : null,
        score: rubric.length ? "" : score,
      })
      if (result.ok) toast.success("Feedback saved; the student can see it now.")
      else setError(result.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {rubric.length > 0 ? (
        <div className="grid gap-2">
          {rubric.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <label htmlFor={`crit-${i}`} className="text-sm">
                <span className="font-medium">{r.criterion}</span>
                {r.description && <span className="text-muted-foreground"> · {r.description}</span>}
              </label>
              <span className="flex items-center gap-1 text-sm">
                <Input id={`crit-${i}`} inputMode="decimal" className="h-8 w-16" value={scores[i]} onChange={(e) => setScores(scores.map((s, j) => (j === i ? e.target.value : s)))} />/ {r.max_points}
              </span>
            </div>
          ))}
          <p className="text-sm font-medium tabular-nums">
            Total {Math.round(total * 100) / 100} / {maxScore}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Label htmlFor="overall">Score</Label>
          <Input id="overall" inputMode="decimal" className="h-8 w-20" value={score} onChange={(e) => setScore(e.target.value)} />
          <span className="text-sm">/ {maxScore}</span>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="feedback">Feedback for the student</Label>
        <Textarea id="feedback" rows={5} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
      <FormAlert message={error} />
      <div>
        <Button type="submit" disabled={isPending}>
          Save feedback
        </Button>
      </div>
    </form>
  )
}
