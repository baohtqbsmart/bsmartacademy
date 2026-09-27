"use client"

import { HighlighterIcon, MessageSquarePlusIcon, PencilIcon, RotateCcwIcon, TimerIcon, Trash2Icon, UndoIcon } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  addAnnotationAction,
  deleteAnnotationAction,
  gradeAction,
  resubmissionAction,
  saveCommentAction,
  updateAnnotationAction,
} from "@/features/assessments/actions"
import { AnnotatedText, AnnotationList, type AnnotationView } from "@/features/assessments/components/feedback-view"
import {
  CATEGORY_LABELS,
  formatSeconds,
  IELTS_NOTICE,
  SPEAKING_CATEGORIES,
  totalScore,
  validScore,
  WRITING_CATEGORIES,
  type AnnotationCategory,
  type AssessmentKind,
  type Criterion,
  type Scoring,
} from "@/features/assessments/scoring"
import { useT } from "@/i18n/client"

type LibraryComment = { id: string; kind: AssessmentKind | null; category: AnnotationCategory; body: string }

type Anchor = { anchor: "text"; start: number; end: number; quote: string } | { anchor: "time"; time: number } | { anchor: "general" }

type GradingPanelProps = {
  submissionId: string
  kind: AssessmentKind
  text: string | null
  media: { url: string; mime: string } | null
  annotations: AnnotationView[]
  library: LibraryComment[]
  criteria: Criterion[]
  scoring: Scoring
  maxScore: number
  grade: { scores: number[] | null; feedback: string | null; returned: boolean }
  resubmission: { isLatest: boolean; allowed: boolean }
}

/** Character offsets of the current selection inside `container` (its text must be the raw answer). */
function selectionOffsets(container: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const before = document.createRange()
  before.selectNodeContents(container)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  const quote = range.toString()
  if (quote.trim() === "") return null
  return { start, end: start + quote.length, quote }
}

export function GradingPanel(props: GradingPanelProps) {
  const t = useT()
  const { submissionId, kind, text, media, annotations, library, criteria, scoring, maxScore, grade, resubmission } = props
  const textRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const categories = kind === "writing" ? WRITING_CATEGORIES : SPEAKING_CATEGORIES

  function captureSelection() {
    if (!textRef.current) return
    const offsets = selectionOffsets(textRef.current)
    if (offsets) setAnchor({ anchor: "text", ...offsets })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("Student's work")}</CardTitle>
            <CardDescription>
              {text ? t("Select words to highlight them, then add a comment and a suggested correction.") : media ? t("Pause where you want to comment and add a time-stamped comment.") : t("Open the document, then add general comments.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {media &&
              (media.mime.startsWith("video/") ? (
                <video ref={(el) => void (mediaRef.current = el)} controls src={media.url} className="max-h-96 w-full rounded-md" />
              ) : media.mime.startsWith("audio/") ? (
                <audio ref={(el) => void (mediaRef.current = el)} controls src={media.url} className="w-full" />
              ) : null)}
            {text && (
              <div onMouseUp={captureSelection} onKeyUp={captureSelection}>
                <AnnotatedText text={text} annotations={annotations} containerRef={textRef} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {text && (
                <Button type="button" variant="outline" size="sm" onClick={captureSelection}>
                  <HighlighterIcon aria-hidden /> {t("Comment on the selection")}
                </Button>
              )}
              {media && (media.mime.startsWith("audio/") || media.mime.startsWith("video/")) && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAnchor({ anchor: "time", time: mediaRef.current?.currentTime ?? 0 })}>
                  <TimerIcon aria-hidden /> {t("Comment at the current time")}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setAnchor({ anchor: "general" })}>
                <MessageSquarePlusIcon aria-hidden /> {t("General comment")}
              </Button>
            </div>
            {anchor && (
              <Composer
                key={JSON.stringify(anchor)}
                submissionId={submissionId}
                anchor={anchor}
                kind={kind}
                categories={categories}
                library={library}
                onDone={() => {
                  setAnchor(null)
                  window.getSelection()?.removeAllRanges()
                }}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Comments ({length})", { length: annotations.length })}</CardTitle>
            <CardDescription>{t("Students see them when you return the grade.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AnnotationList
              annotations={annotations}
              actions={(a) => (
                <>
                  <EditAnnotation annotation={a} categories={categories} />
                  <ConfirmActionButton
                    variant="ghost"
                    size="icon"
                    aria-label={t("Delete comment")}
                    title={t("Delete this comment?")}
                    description={t("It is removed from the student's feedback.")}
                    confirmLabel={t("Delete")}
                    successMessage={t("Comment deleted.")}
                    destructive
                    action={deleteAnnotationAction.bind(null, { annotationId: a.id })}
                  >
                    <Trash2Icon />
                  </ConfirmActionButton>
                </>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <ScoreForm submissionId={submissionId} criteria={criteria} scoring={scoring} maxScore={maxScore} grade={grade} library={library} kind={kind} />
        {resubmission.isLatest && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Resubmission")}</CardTitle>
              <CardDescription>
                {resubmission.allowed ? t("The student may hand in a new attempt.") : t("Allow the student to hand in a new attempt; this one stays in the history.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfirmActionButton
                title={resubmission.allowed ? t("Withdraw the resubmission?") : t("Allow a resubmission?")}
                description={resubmission.allowed ? t("The student can no longer hand in a new attempt.") : t("The student can hand in a new attempt while the task is open.")}
                confirmLabel={resubmission.allowed ? t("Withdraw") : t("Allow")}
                successMessage={t("Saved.")}
                action={resubmissionAction.bind(null, { submissionId, allowed: !resubmission.allowed })}
              >
                {resubmission.allowed ? <UndoIcon aria-hidden /> : <RotateCcwIcon aria-hidden />}
                {resubmission.allowed ? t("Withdraw resubmission") : t("Allow resubmission")}
              </ConfirmActionButton>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Composer({
  submissionId,
  anchor,
  kind,
  categories,
  library,
  onDone,
}: {
  submissionId: string
  anchor: Anchor
  kind: AssessmentKind
  categories: AnnotationCategory[]
  library: LibraryComment[]
  onDone: () => void
}) {
  const t = useT()
  const [category, setCategory] = useState<AnnotationCategory>(categories[0])
  const [comment, setComment] = useState("")
  const [suggestion, setSuggestion] = useState("")
  const [keep, setKeep] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const reusable = library.filter((c) => !c.kind || c.kind === kind)

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await addAnnotationAction({
        submissionId,
        anchor: anchor.anchor,
        start: anchor.anchor === "text" ? anchor.start : null,
        end: anchor.anchor === "text" ? anchor.end : null,
        time: anchor.anchor === "time" ? Math.round(anchor.time * 100) / 100 : null,
        category,
        comment,
        suggestion,
      })
      if (!result.ok) return setError(result.error.message)
      if (keep && comment.trim()) {
        const saved = await saveCommentAction({ kind, category, body: comment, shared: false })
        if (!saved.ok) toast.error(saved.error.message)
      }
      toast.success(t("Comment added."))
      onDone()
    })
  }

  return (
    <div className="bg-muted/40 grid gap-3 rounded-md border p-3">
      <p className="text-sm">
        {anchor.anchor === "text" && (
          <>
            {t("On:")} <mark className="rounded-sm bg-[#fab219]/30 px-0.5">{anchor.quote}</mark>
          </>
        )}
        {anchor.anchor === "time" && <>{t("At {seconds}", { seconds: formatSeconds(anchor.time) })}</>}
        {anchor.anchor === "general" && t("General comment")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="c-cat" label={t("Category")}>
          <OptionSelect id="c-cat" value={category} onChange={(v) => setCategory(v as AnnotationCategory)} options={categories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))} placeholder={t("Category")} />
        </Field>
        <Field id="c-reuse" label={t("Reusable comment")}>
          <OptionSelect
            id="c-reuse"
            value=""
            onChange={(id) => {
              const picked = reusable.find((c) => c.id === id)
              if (!picked) return
              setCategory(picked.category)
              setComment((current) => (current ? `${current} ${picked.body}` : picked.body))
            }}
            options={reusable.map((c) => ({ id: c.id, label: `${CATEGORY_LABELS[c.category]}: ${c.body}` }))}
            placeholder={t("Insert a saved comment")}
          />
        </Field>
      </div>
      <Field id="c-comment" label={t("Comment")}>
        <Textarea id="c-comment" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      {anchor.anchor !== "time" && (
        <Field id="c-suggestion" label={t("Suggested correction")}>
          <Input id="c-suggestion" maxLength={2000} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={keep} onCheckedChange={(checked) => setKeep(checked === true)} /> {t("Also save this comment to my library")}
      </label>
      <FormAlert message={error} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={save}>
          {t("Add comment")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
      </div>
    </div>
  )
}

function EditAnnotation({ annotation, categories }: { annotation: AnnotationView; categories: AnnotationCategory[] }) {
  const t = useT()
  const [category, setCategory] = useState(annotation.category)
  const [comment, setComment] = useState(annotation.comment ?? "")
  const [suggestion, setSuggestion] = useState(annotation.suggestion ?? "")
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={t("Edit comment")}>
          <PencilIcon />
        </Button>
      }
      title={t("Edit comment")}
      submitLabel={t("Save")}
      successMessage={t("Comment updated.")}
      onOpen={() => {
        setCategory(annotation.category)
        setComment(annotation.comment ?? "")
        setSuggestion(annotation.suggestion ?? "")
      }}
      onSubmit={() => updateAnnotationAction({ annotationId: annotation.id, category, comment, suggestion })}
    >
      <Field id="e-cat" label={t("Category")}>
        <OptionSelect id="e-cat" value={category} onChange={(v) => setCategory(v as AnnotationCategory)} options={categories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))} placeholder={t("Category")} />
      </Field>
      <Field id="e-comment" label={t("Comment")}>
        <Textarea id="e-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <Field id="e-suggestion" label={t("Suggested correction")}>
        <Input id="e-suggestion" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
      </Field>
    </ActionDialog>
  )
}

function ScoreForm({
  submissionId,
  criteria,
  scoring,
  maxScore,
  grade,
  library,
  kind,
}: {
  submissionId: string
  criteria: Criterion[]
  scoring: Scoring
  maxScore: number
  grade: { scores: number[] | null; feedback: string | null; returned: boolean }
  library: LibraryComment[]
  kind: AssessmentKind
}) {
  const t = useT()
  const [scores, setScores] = useState<string[]>(criteria.map((_, i) => (grade.scores?.[i] !== undefined ? String(grade.scores[i]) : "")))
  const [feedback, setFeedback] = useState(grade.feedback ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const numbers = scores.map((s) => Number(s.replace(",", ".")))
  const complete = scores.every((s, i) => s.trim() !== "" && validScore(scoring, criteria[i], numbers[i]))
  const total = complete ? totalScore(scoring, numbers) : null

  function save(publish: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await gradeAction({ submissionId, scores: numbers, feedback, publish })
      if (result.ok) toast.success(t(publish || grade.returned ? "Grade saved and visible to the student." : "Grade saved (not visible to the student yet)."))
      else setError(result.error.message)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Score")}</CardTitle>
        <CardDescription>{scoring === "ielts_band" ? IELTS_NOTICE : t("Out of {maxScore}.", { maxScore })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          {criteria.map((c, i) => (
            <div key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Label htmlFor={`crit-${i}`} className="grid gap-0.5 font-normal">
                <span className="font-medium">{c.name}</span>
                {c.description && <span className="text-muted-foreground text-xs">{c.description}</span>}
              </Label>
              <span className="flex items-center gap-1 text-sm">
                <Input
                  id={`crit-${i}`}
                  inputMode="decimal"
                  className="h-8 w-16"
                  value={scores[i]}
                  aria-invalid={scores[i] !== "" && !validScore(scoring, c, numbers[i])}
                  onChange={(e) => setScores(scores.map((s, j) => (j === i ? e.target.value : s)))}
                />
                / {c.max_points}
              </span>
            </div>
          ))}
        </div>
        <p className="text-lg font-semibold tabular-nums">
          {scoring === "ielts_band" ? t("Overall band") : t("Total")}: {total ?? "—"} {scoring !== "ielts_band" && `/ ${maxScore}`}
        </p>
        {scoring === "ielts_band" && <p className="text-muted-foreground text-xs">{t("Whole bands per criterion; the overall band is their average rounded to the nearest half band.")}</p>}
        <div className="grid gap-2">
          <Label htmlFor="overall-feedback">{t("Feedback")}</Label>
          <Textarea id="overall-feedback" rows={6} maxLength={10000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <OptionSelect
            id="feedback-reuse"
            ariaLabel={t("Insert a saved comment into the feedback")}
            value=""
            onChange={(id) => {
              const picked = library.find((c) => c.id === id)
              if (picked) setFeedback((f) => (f ? `${f}\n${picked.body}` : picked.body))
            }}
            options={library.filter((c) => !c.kind || c.kind === kind).map((c) => ({ id: c.id, label: `${CATEGORY_LABELS[c.category]}: ${c.body}` }))}
            placeholder={t("Insert a saved comment")}
          />
        </div>
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!complete || isPending} onClick={() => save(true)}>
            {grade.returned ? t("Update returned grade") : t("Save and return")}
          </Button>
          {!grade.returned && (
            <Button type="button" variant="outline" disabled={!complete || isPending} onClick={() => save(false)}>
              {t("Save without returning")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
