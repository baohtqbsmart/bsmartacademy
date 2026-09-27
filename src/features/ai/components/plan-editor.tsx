"use client"

import { CheckIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { FormAlert } from "@/components/shared/form-alert"
import { OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { draftStatusAction, saveDraftAction } from "@/features/ai/actions"
import { describeIssues, EXERCISE_LABELS, EXERCISE_TYPES, lessonPlanSchema, STAGE_NAMES, STAGES, type LessonPlan } from "@/features/ai/content"
import { useT } from "@/i18n/client"

type Plan = LessonPlan
const toLines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean)
const fromLines = (items: string[]) => items.join("\n")

/**
 * Review and edit an AI draft. Every save is validated (here and again on the
 * server); approval freezes the plan. Approving does not publish anything.
 */
export function PlanEditor({ draftId, initial, warnings: initialWarnings }: { draftId: string; initial: Plan; warnings: string[] }) {
  const tr = useT()
  const [plan, setPlan] = useState<Plan>(initial)
  const [saved, setSaved] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState(initialWarnings)
  const [isPending, startTransition] = useTransition()
  const dirty = plan !== saved
  const set = <K extends keyof Plan>(key: K, value: Plan[K]) => setPlan((p) => ({ ...p, [key]: value }))

  async function save() {
    setError(null)
    const parsed = lessonPlanSchema.safeParse(plan)
    if (!parsed.success) {
      setError(tr("Not saved: {issues}", { issues: describeIssues(parsed.error).map((issue) => tr(issue)).join("; ") }))
      return false
    }
    const result = await saveDraftAction({ draftId, content: parsed.data })
    if (!result.ok) {
      setError(result.error.message)
      return false
    }
    setSaved(plan)
    setWarnings(result.data)
    return true
  }

  return (
    <div className="grid gap-6">
      <FormAlert message={error} />
      {warnings.length > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">{tr("Check before approving:")}</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{tr(w)}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tr("Overview")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TextField label={tr("Title")} value={plan.title} max={200} onChange={(v) => set("title", v)} />
          <AreaField label={tr("Summary")} value={plan.summary} max={1000} rows={2} onChange={(v) => set("summary", v)} />
          <LinesField label={tr("Learning objectives (one per line)")} value={plan.objectives} onChange={(v) => set("objectives", v)} />
        </CardContent>
      </Card>

      {STAGES.map((s) => (
        <Card key={s}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              {tr(STAGE_NAMES[s])}
              <span className="flex items-center gap-2 text-sm font-normal">
                <Label htmlFor={`min-${s}`}>{tr("Minutes")}</Label>
                <Input id={`min-${s}`} type="number" min={1} max={180} className="h-8 w-20" value={plan[s].minutes} onChange={(e) => set(s, { ...plan[s], minutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <LinesField label={tr("Steps (one per line)")} value={plan[s].steps} onChange={(v) => set(s, { ...plan[s], steps: v })} rows={5} />
            <LinesField label={tr("Materials (one per line)")} value={plan[s].materials} onChange={(v) => set(s, { ...plan[s], materials: v })} rows={2} />
            <AreaField label={tr("Teacher notes")} value={plan[s].teacherNotes} max={1000} rows={2} onChange={(v) => set(s, { ...plan[s], teacherNotes: v })} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{tr("Vocabulary ({length})", { length: plan.vocabulary.length })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {plan.vocabulary.map((v, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_7rem_2fr_2fr_1fr_auto]">
              {(["word", "partOfSpeech", "meaning", "example", "vietnamese"] as const).map((k) => (
                <Input key={k} aria-label={tr("{k} {value}", { k, value: i + 1 })} placeholder={k === "partOfSpeech" ? tr("part of speech") : k} value={v[k]} onChange={(e) => set("vocabulary", plan.vocabulary.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
              ))}
              <Button variant="ghost" size="icon" aria-label={tr("Remove word {value}", { value: i + 1 })} onClick={() => set("vocabulary", plan.vocabulary.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" disabled={plan.vocabulary.length >= 30} onClick={() => set("vocabulary", [...plan.vocabulary, { word: "", partOfSpeech: "noun", meaning: "", example: "", vietnamese: "" }])}>
              <PlusIcon aria-hidden /> {tr("Add word")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Texts")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <AreaField label={tr("Reading text")} value={plan.readingText} max={6000} rows={6} onChange={(v) => set("readingText", v)} />
          <AreaField label={tr("Listening script (for the teacher)")} value={plan.listeningScript} max={6000} rows={4} onChange={(v) => set("listeningScript", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Exercises ({length})", { length: plan.exercises.length })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {plan.exercises.map((e, i) => {
            const update = (patch: Partial<Plan["exercises"][number]>) => set("exercises", plan.exercises.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            return (
              <div key={i} className="grid gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-6 text-sm tabular-nums">{i + 1}.</span>
                  <div className="w-48">
                    <OptionSelect ariaLabel={tr("Exercise {value} type", { value: i + 1 })} id={`ex-type-${i}`} value={e.type} onChange={(t) => update({ type: t as (typeof EXERCISE_TYPES)[number] })} options={EXERCISE_TYPES.map((t) => ({ id: t, label: EXERCISE_LABELS[t] }))} placeholder={tr("Type")} />
                  </div>
                  <Button variant="ghost" size="icon" className="ml-auto" aria-label={tr("Remove exercise {value}", { value: i + 1 })} onClick={() => set("exercises", plan.exercises.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </div>
                <Textarea aria-label={tr("Exercise {value} prompt", { value: i + 1 })} rows={2} maxLength={600} value={e.prompt} onChange={(ev) => update({ prompt: ev.target.value })} placeholder={tr("Question (mark gaps with ___)")} />
                {(e.type === "multiple_choice" || e.type === "matching") && (
                  <Textarea aria-label={tr("Exercise {value} options", { value: i + 1 })} rows={3} value={fromLines(e.options)} onChange={(ev) => update({ options: toLines(ev.target.value) })} placeholder={tr("Options, one per line")} />
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label={tr("Exercise {value} answer", { value: i + 1 })} maxLength={300} value={e.answer} onChange={(ev) => update({ answer: ev.target.value })} placeholder={e.type === "true_false" ? tr("True or False") : e.type === "multiple_choice" ? tr("Must match one option exactly") : tr("Answer")} />
                  <Input aria-label={tr("Exercise {value} explanation", { value: i + 1 })} maxLength={600} value={e.explanation} onChange={(ev) => update({ explanation: ev.target.value })} placeholder={tr("Explanation (optional)")} />
                </div>
              </div>
            )
          })}
          <div>
            <Button variant="outline" size="sm" disabled={plan.exercises.length >= 30} onClick={() => set("exercises", [...plan.exercises, { type: "short_answer", prompt: "", options: [], answer: "", explanation: "" }])}>
              <PlusIcon aria-hidden /> {tr("Add exercise")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Speaking, writing and differentiation")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <LinesField label={tr("Speaking prompts (one per line)")} value={plan.speakingPrompts} onChange={(v) => set("speakingPrompts", v)} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={plan.writingPrompt !== null} onCheckedChange={(on) => set("writingPrompt", on === true ? { task: "", minWords: 50, maxWords: 100, criteria: ["Task achieved"] } : null)} /> {tr("Writing task")}
          </label>
          {plan.writingPrompt && (
            <div className="grid gap-2 rounded-md border p-3">
              <AreaField label={tr("Task")} value={plan.writingPrompt.task} max={1000} rows={2} onChange={(v) => set("writingPrompt", { ...plan.writingPrompt!, task: v })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={tr("Minimum words")} value={plan.writingPrompt.minWords} onChange={(n) => set("writingPrompt", { ...plan.writingPrompt!, minWords: n })} />
                <NumberField label={tr("Maximum words")} value={plan.writingPrompt.maxWords} onChange={(n) => set("writingPrompt", { ...plan.writingPrompt!, maxWords: n })} />
              </div>
              <LinesField label={tr("Criteria (one per line)")} value={plan.writingPrompt.criteria} onChange={(v) => set("writingPrompt", { ...plan.writingPrompt!, criteria: v })} rows={3} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={plan.differentiation !== null} onCheckedChange={(on) => set("differentiation", on === true ? { support: [""], core: [""], challenge: [""] } : null)} /> {tr("Differentiated activities")}
          </label>
          {plan.differentiation && (
            <div className="grid gap-2 sm:grid-cols-3">
              {(["support", "core", "challenge"] as const).map((k) => (
                <LinesField key={k} label={k[0].toUpperCase() + k.slice(1)} value={plan.differentiation![k]} rows={4} onChange={(v) => set("differentiation", { ...plan.differentiation!, [k]: v })} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Homework")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <AreaField label={tr("Instructions")} value={plan.homework.instructions} max={1000} rows={2} onChange={(v) => set("homework", { ...plan.homework, instructions: v })} />
          <LinesField label={tr("Tasks (one per line)")} value={plan.homework.tasks} onChange={(v) => set("homework", { ...plan.homework, tasks: v })} />
        </CardContent>
      </Card>

      <div className="bg-background/95 sticky bottom-0 flex flex-wrap items-center gap-2 border-t py-3 backdrop-blur print:hidden">
        <Button
          variant="outline"
          disabled={!dirty || isPending}
          onClick={() =>
            startTransition(async () => {
              if (await save()) toast.success(tr("Changes saved."))
            })
          }
        >
          <SaveIcon aria-hidden /> {tr("Save changes")}
        </Button>
        <ConfirmActionButton
          variant="default"
          title={tr("Approve this plan?")}
          description={tr("The plan is saved and frozen. Approving does not publish anything: you can then save it as a private lesson design or a draft homework assignment, and publish those yourself when ready.")}
          confirmLabel={tr("Approve")}
          successMessage={tr("Plan approved.")}
          action={async () => {
            if (dirty && !(await save())) return { ok: false, error: { code: "VALIDATION", message: "Fix the problems above before approving." } }
            return draftStatusAction({ draftId, status: "approved" })
          }}
        >
          <CheckIcon aria-hidden /> {tr("Approve")}
        </ConfirmActionButton>
        <ConfirmActionButton variant="ghost" title={tr("Discard this draft?")} description={tr("It stays in your list as discarded and cannot be edited again.")} confirmLabel={tr("Discard")} successMessage={tr("Draft discarded.")} destructive action={() => draftStatusAction({ draftId, status: "discarded" })}>
          <XIcon aria-hidden /> {tr("Discard")}
        </ConfirmActionButton>
        {dirty && <span className="text-muted-foreground text-xs">{tr("Unsaved changes")}</span>}
      </div>
    </div>
  )
}

function TextField({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  const t = useT()
  const id = `f-${label.replace(/\W+/g, "-")}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      <Input id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function AreaField({ label, value, max, rows, onChange }: { label: string; value: string; max: number; rows: number; onChange: (v: string) => void }) {
  const t = useT()
  const id = `f-${label.replace(/\W+/g, "-")}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      <Textarea id={id} rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const t = useT()
  const id = `f-${label.replace(/\W+/g, "-")}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      <Input id={id} type="number" min={10} max={1500} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  )
}

/** A list edited as lines: blank lines are dropped when saving. */
function LinesField({ label, value, rows = 3, onChange }: { label: string; value: string[]; rows?: number; onChange: (v: string[]) => void }) {
  const t = useT()
  const id = `f-${label.replace(/\W+/g, "-")}`
  const [text, setText] = useState(fromLines(value))
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(toLines(e.target.value))
        }}
      />
    </div>
  )
}
