"use client"

import { SparklesIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { generateDraftAction } from "@/features/ai/actions"
import { AI_SKILLS, AI_TASKS, CEFR_LEVELS, CEFR_NAMES, SKILL_NAMES, TASK_LABELS } from "@/features/ai/content"
import type { FieldErrors } from "@/lib/action-result"
import { useT } from "@/i18n/client"

export function GenerateForm({ disabled }: { disabled: boolean }) {
  const tr = useT()
  const [v, setV] = useState({ task: "lesson", topic: "", cefr: "a2", studentAge: "11", skill: "mixed", objective: "", durationMinutes: "45", notes: "" })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = (key: keyof typeof v, value: string) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{tr(fieldErrors[name]![0])}</p>

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await generateDraftAction(v)
      if (result && !result.ok) {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <FormAlert message={error} />
      <Card>
        <CardHeader>
          <CardTitle>{tr("What do you need?")}</CardTitle>
          <CardDescription>{tr("The AI writes a draft for you to review. Nothing is shown to students unless you approve it and publish it yourself.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ai-task" label={tr("Type")}>
              <OptionSelect id="ai-task" value={v.task} onChange={(x) => set("task", x)} options={AI_TASKS.map((t) => ({ id: t, label: TASK_LABELS[t] }))} placeholder={tr("Type")} />
            </Field>
            <Field id="ai-skill" label={tr("Skill")}>
              <OptionSelect id="ai-skill" value={v.skill} onChange={(x) => set("skill", x)} options={AI_SKILLS.map((s) => ({ id: s, label: SKILL_NAMES[s] }))} placeholder={tr("Skill")} />
            </Field>
          </div>
          <Field id="ai-topic" label={tr("Topic")}>
            <Input id="ai-topic" maxLength={200} value={v.topic} onChange={(e) => set("topic", e.target.value)} placeholder={tr("Animals at the zoo")} />
            {fieldError("topic")}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="ai-cefr" label={tr("CEFR level")}>
              <OptionSelect id="ai-cefr" value={v.cefr} onChange={(x) => set("cefr", x)} options={CEFR_LEVELS.map((c) => ({ id: c, label: CEFR_NAMES[c] }))} placeholder={tr("Level")} />
            </Field>
            <Field id="ai-age" label={tr("Student age")}>
              <Input id="ai-age" type="number" min={4} max={80} value={v.studentAge} onChange={(e) => set("studentAge", e.target.value)} />
              {fieldError("studentAge")}
            </Field>
            <Field id="ai-duration" label={tr("Lesson duration (minutes)")}>
              <Input id="ai-duration" type="number" min={10} max={180} step={5} value={v.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} />
              {fieldError("durationMinutes")}
            </Field>
          </div>
          <Field id="ai-objective" label={tr("Learning objective")}>
            <Textarea id="ai-objective" rows={2} maxLength={500} value={v.objective} onChange={(e) => set("objective", e.target.value)} placeholder={tr("Students can describe animals using can/can't.")} />
            {fieldError("objective")}
          </Field>
          <Field id="ai-notes" label={tr("Anything else (optional)")}>
            <Textarea id="ai-notes" rows={2} maxLength={1000} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder={tr("Mixed-ability class of 12; they love games; no audio equipment.")} />
          </Field>
          <p className="text-muted-foreground text-xs">{tr("Do not include students' names or personal information: the request is sent to an external AI provider.")}</p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={isPending} disabled={disabled}>
          <SparklesIcon aria-hidden /> {isPending ? tr("Writing the draft…") : tr("Generate draft")}
        </SubmitButton>
        {isPending && (
          <span className="text-muted-foreground text-sm" role="status">
            {tr("This usually takes 20–60 seconds. Please keep this page open.")}
          </span>
        )}
      </div>
    </form>
  )
}
