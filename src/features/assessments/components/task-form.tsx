"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveTaskAction } from "@/features/assessments/actions"
import { CriteriaEditor } from "@/features/assessments/components/rubric-editor"
import type { TaskFormInput } from "@/features/assessments/schemas"
import {
  IELTS_NOTICE,
  maxScore,
  RESPONSE_LABELS,
  SCORING_LABELS,
  SPEAKING_RESPONSES,
  WRITING_RESPONSES,
  type Criterion,
  type Scoring,
} from "@/features/assessments/scoring"
import { CEFR_LABELS, CEFR_LEVELS } from "@/features/tests/questions"
import type { FieldErrors } from "@/lib/action-result"
import { useT } from "@/i18n/client"

const NONE = "__none"

type RubricOption = { id: string; name: string; kind: string; scoring: Scoring; criteriaList: Criterion[] }

export function TaskForm({
  initial,
  classes,
  rubrics,
  locked,
  cancelHref,
}: {
  initial: TaskFormInput
  classes: { id: string; name: string }[]
  rubrics: RubricOption[]
  /** Rubric frozen once work has been handed in (the database refuses changes). */
  locked: boolean
  cancelHref: string
}) {
  const t = useT()
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = <K extends keyof TaskFormInput>(key: K, value: TaskFormInput[K]) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{t(fieldErrors[name]![0])}</p>
  const writing = v.kind === "writing"
  const criteria = v.criteria as { name: string; description: string; maxPoints: string }[]

  function applyTemplate(id: string) {
    const r = rubrics.find((x) => x.id === id)
    if (!r) return
    setV((c) => ({
      ...c,
      rubricId: r.id,
      scoring: r.scoring,
      criteria: r.criteriaList.map((cr) => ({ name: cr.name, description: cr.description ?? "", maxPoints: String(cr.max_points) })),
    }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveTaskAction(v)
      if (result && !result.ok) {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  const total = maxScore(v.scoring as Scoring, criteria.map((c) => ({ name: c.name, max_points: Number(c.maxPoints.replace(",", ".")) || 0 })))

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <FormAlert message={error} />
      <Card>
        <CardHeader>
          <CardTitle>{t("Task")}</CardTitle>
          <CardDescription>{t("Saved as a draft; publish it from the task page.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="t-title" label={t("Title")}>
            <Input id="t-title" value={v.title} onChange={(e) => set("title", e.target.value)} />
            {fieldError("title")}
          </Field>
          <Field id="t-class" label={t("Class")}>
            <OptionSelect id="t-class" value={v.classId} onChange={(value) => set("classId", value)} options={classes.map((c) => ({ id: c.id, label: c.name }))} placeholder={t("Choose a class")} />
            {fieldError("classId")}
          </Field>
          <Field id="t-level" label={t("Level")}>
            <OptionSelect
              id="t-level"
              value={v.cefrLevel || NONE}
              onChange={(value) => set("cefrLevel", (value === NONE ? "" : value) as TaskFormInput["cefrLevel"])}
              options={[{ id: NONE, label: "Not set" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: CEFR_LABELS[l] }))]}
              placeholder={t("Level")}
            />
          </Field>
          <Field id="t-mode" label={t("Students answer by")}>
            <OptionSelect
              id="t-mode"
              value={v.responseMode}
              onChange={(value) => set("responseMode", value as TaskFormInput["responseMode"])}
              options={(writing ? WRITING_RESPONSES : SPEAKING_RESPONSES).map((m) => ({ id: m, label: RESPONSE_LABELS[m] }))}
              placeholder={t("Choose")}
            />
            {fieldError("responseMode")}
          </Field>
          <div className="sm:col-span-2">
            <Field id="t-task" label={writing ? t("Writing task") : t("Speaking prompt")}>
              <Textarea id="t-task" rows={4} value={v.task} onChange={(e) => set("task", e.target.value)} />
              {fieldError("task")}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="t-instr" label={t("Instructions")}>
              <Textarea id="t-instr" rows={3} value={v.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} />
            </Field>
          </div>
          {writing ? (
            <>
              <Field id="t-min" label={t("Minimum words")}>
                <Input id="t-min" inputMode="numeric" value={v.minWords} onChange={(e) => set("minWords", e.target.value)} />
              </Field>
              <Field id="t-max" label={t("Maximum words")}>
                <Input id="t-max" inputMode="numeric" value={v.maxWords} onChange={(e) => set("maxWords", e.target.value)} />
                {fieldError("maxWords")}
              </Field>
            </>
          ) : (
            <Field id="t-dur" label={t("Recording length (seconds, guide)")}>
              <Input id="t-dur" inputMode="numeric" value={v.maxDurationSeconds} onChange={(e) => set("maxDurationSeconds", e.target.value)} />
            </Field>
          )}
          <Field id="t-due" label={t("Due (Vietnam time)")}>
            <Input id="t-due" type="datetime-local" value={v.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
          </Field>
          <Field id="t-attempts" label={t("Attempts allowed")}>
            <Input id="t-attempts" inputMode="numeric" value={v.maxAttempts} onChange={(e) => set("maxAttempts", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <Checkbox checked={v.allowLate} onCheckedChange={(checked) => set("allowLate", checked === true)} />
            {t("Accept late work (marked late)")}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Rubric · maximum {total}", { total })}</CardTitle>
          <CardDescription>
            {locked
              ? t("Students have handed in work, so the rubric can no longer change.")
              : t("Start from a template, then adjust. The task keeps its own copy.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!locked && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="t-template" label={t("Template")}>
                <OptionSelect
                  id="t-template"
                  value={v.rubricId ?? ""}
                  onChange={applyTemplate}
                  options={rubrics.filter((r) => r.kind === v.kind).map((r) => ({ id: r.id, label: r.name }))}
                  placeholder={t("Choose a template")}
                />
              </Field>
              <Field id="t-scoring" label={t("Scoring")}>
                <OptionSelect
                  id="t-scoring"
                  value={v.scoring}
                  onChange={(value) => set("scoring", value as Scoring)}
                  options={(["points", "ielts_band"] as const).map((s) => ({ id: s, label: SCORING_LABELS[s] }))}
                  placeholder={t("Scoring")}
                />
              </Field>
            </div>
          )}
          {v.scoring === "ielts_band" && <p className="text-muted-foreground text-sm">{IELTS_NOTICE}</p>}
          {locked ? (
            <ul className="grid gap-1 text-sm">
              {criteria.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name}</span> · {c.maxPoints}
                </li>
              ))}
            </ul>
          ) : (
            <CriteriaEditor value={criteria} onChange={(value) => set("criteria", value)} scoring={v.scoring as Scoring} />
          )}
          {fieldError("criteria")}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <SubmitButton pending={isPending}>{t("Save task")}</SubmitButton>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>{t("Cancel")}</Link>
        </Button>
      </div>
    </form>
  )
}
