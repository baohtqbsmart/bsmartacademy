"use client"

import { PlusIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveLessonAction } from "@/features/english/actions"
import { WordPicker, type PickableWord } from "@/features/english/components/set-editor"
import type { LessonFormInput } from "@/features/english/schemas"
import { isWorkSkill, LESSON_SKILLS, RESPONSE_MODE_LABELS, SKILL_LABELS, type LessonSkill } from "@/features/english/skills"
import { CEFR_LABELS, CEFR_LEVELS } from "@/features/tests/questions"
import type { FieldErrors } from "@/lib/action-result"
import { useT } from "@/i18n/client"

const NONE = "__none"
const BODY_LABEL: Record<LessonSkill, string> = {
  grammar: "Explanation",
  reading: "Reading passage",
  listening: "Instructions for students",
  speaking: "Speaking prompt",
  writing: "Writing prompt",
  pronunciation: "Instructions and practice text",
}

export function LessonForm({
  initial,
  words,
  skillLocked,
  cancelHref,
}: {
  initial: LessonFormInput
  words: PickableWord[]
  skillLocked: boolean
  cancelHref: string
}) {
  const t = useT()
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = <K extends keyof LessonFormInput>(key: K, value: LessonFormInput[K]) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{t(fieldErrors[name]![0])}</p>
  const skill = v.skill as LessonSkill
  const work = isWorkSkill(skill)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveLessonAction(v)
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
          <CardTitle>{t("Lesson")}</CardTitle>
          <CardDescription>
            {t("Saved as a draft. {value}", { value: skill === "listening"
              ? "Upload the audio on the lesson page before publishing."
              : work
                ? "Students hand in work that teachers review."
                : "Add exercises from the question bank on the lesson page." })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="l-skill" label={t("Skill")}>
            {skillLocked ? (
              <p className="text-sm">{t(SKILL_LABELS[skill])}</p>
            ) : (
              <OptionSelect id="l-skill" value={v.skill} onChange={(value) => set("skill", value)} options={LESSON_SKILLS.map((s) => ({ id: s, label: SKILL_LABELS[s] }))} placeholder={t("Skill")} />
            )}
          </Field>
          <Field id="l-cefr" label={t("CEFR level")}>
            <OptionSelect
              id="l-cefr"
              value={v.cefrLevel || NONE}
              onChange={(value) => set("cefrLevel", (value === NONE ? "" : value) as LessonFormInput["cefrLevel"])}
              options={[{ id: NONE, label: "Not set" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: CEFR_LABELS[l] }))]}
              placeholder={t("Level")}
            />
          </Field>
          <Field id="l-title" label={t("Title")}>
            <Input id="l-title" value={v.title} onChange={(e) => set("title", e.target.value)} />
            {fieldError("title")}
          </Field>
          <Field id="l-topic" label={t("Topic")}>
            <Input id="l-topic" value={v.topic ?? ""} onChange={(e) => set("topic", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="l-summary" label={t("Summary")}>
              <Input id="l-summary" value={v.summary ?? ""} onChange={(e) => set("summary", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="l-body" label={t(BODY_LABEL[skill])}>
              <Textarea id="l-body" rows={skill === "reading" ? 12 : 6} value={v.body ?? ""} onChange={(e) => set("body", e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {skill === "grammar" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Grammar")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field id="l-form" label={t("Form")}>
              <Textarea id="l-form" rows={4} value={v.form ?? ""} onChange={(e) => set("form", e.target.value)} />
            </Field>
            <Field id="l-usage" label={t("Usage")}>
              <Textarea id="l-usage" rows={3} value={v.usage ?? ""} onChange={(e) => set("usage", e.target.value)} />
            </Field>
            <Field id="l-examples" label={t("Examples (one per line)")}>
              <Textarea id="l-examples" rows={4} value={v.examples} onChange={(e) => set("examples", e.target.value)} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("Common mistakes")}</legend>
              {v.mistakes.map((m, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input aria-label={t("Mistake {value}: wrong", { value: i + 1 })} placeholder={t("✗ She don't like…")} value={m.incorrect} onChange={(e) => set("mistakes", v.mistakes.map((x, j) => (j === i ? { ...x, incorrect: e.target.value } : x)))} />
                  <Input aria-label={t("Mistake {value}: right", { value: i + 1 })} placeholder={t("✓ She doesn't like…")} value={m.correct} onChange={(e) => set("mistakes", v.mistakes.map((x, j) => (j === i ? { ...x, correct: e.target.value } : x)))} />
                  <Input aria-label={t("Mistake {value}: note", { value: i + 1 })} placeholder={t("Why")} value={m.note} onChange={(e) => set("mistakes", v.mistakes.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove mistake {value}", { value: i + 1 })} onClick={() => set("mistakes", v.mistakes.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => set("mistakes", [...v.mistakes, { incorrect: "", correct: "", note: "" }])}>
                  <PlusIcon aria-hidden /> {t("Add a mistake")}
                </Button>
              </div>
              {fieldError("mistakes")}
            </fieldset>
          </CardContent>
        </Card>
      )}

      {skill === "listening" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Transcript")}</CardTitle>
            <CardDescription>{t("Shown to a student only after they have done the exercises.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea aria-label={t("Transcript")} rows={6} value={v.transcript ?? ""} onChange={(e) => set("transcript", e.target.value)} />
          </CardContent>
        </Card>
      )}

      {(skill === "reading" || skill === "listening") && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Vocabulary")}</CardTitle>
            <CardDescription>{t("Words from the word bank shown with the {value}.", { value: skill === "reading" ? "passage" : "audio" })}</CardDescription>
          </CardHeader>
          <CardContent>
            <WordPicker words={words} selected={v.wordIds} onSave={(ids) => set("wordIds", ids)} />
          </CardContent>
        </Card>
      )}

      {work && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Submission and marking")}</CardTitle>
            <CardDescription>{t("With a rubric, the score is the sum of its criteria.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="l-mode" label={t("Students answer with")}>
                <OptionSelect
                  id="l-mode"
                  value={v.responseMode || ""}
                  onChange={(value) => set("responseMode", value as LessonFormInput["responseMode"])}
                  options={(skill === "writing" ? (["text"] as const) : (["audio", "video", "audio_or_video"] as const)).map((m) => ({ id: m, label: RESPONSE_MODE_LABELS[m] }))}
                  placeholder={t("Choose")}
                />
                {fieldError("responseMode")}
              </Field>
              {skill === "writing" && (
                <>
                  <Field id="l-min" label={t("Minimum words")}>
                    <Input id="l-min" inputMode="numeric" value={v.minWords} onChange={(e) => set("minWords", e.target.value)} />
                  </Field>
                  <Field id="l-max" label={t("Maximum words")}>
                    <Input id="l-max" inputMode="numeric" value={v.maxWords} onChange={(e) => set("maxWords", e.target.value)} />
                    {fieldError("maxWords")}
                  </Field>
                </>
              )}
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("Rubric (optional)")}</legend>
              {v.rubric.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_6rem_auto]">
                  <Input aria-label={t("Criterion {value}", { value: i + 1 })} placeholder={t("Task")} value={r.criterion} onChange={(e) => set("rubric", v.rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} />
                  <Input aria-label={t("Criterion {value} description", { value: i + 1 })} placeholder={t("What earns the points")} value={r.description} onChange={(e) => set("rubric", v.rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <Input aria-label={t("Criterion {value} points", { value: i + 1 })} inputMode="decimal" placeholder={t("Points")} value={r.maxPoints} onChange={(e) => set("rubric", v.rubric.map((x, j) => (j === i ? { ...x, maxPoints: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove criterion {value}", { value: i + 1 })} onClick={() => set("rubric", v.rubric.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => set("rubric", [...v.rubric, { criterion: "", description: "", maxPoints: "" }])}>
                  <PlusIcon aria-hidden /> {t("Add a criterion")}
                </Button>
              </div>
              {fieldError("rubric")}
            </fieldset>
            {v.rubric.length === 0 && (
              <Field id="l-maxscore" label={t("Maximum score")}>
                <Input id="l-maxscore" inputMode="decimal" className="w-28" value={String(v.maxScore)} onChange={(e) => set("maxScore", e.target.value)} />
              </Field>
            )}
            <Field id="l-model" label={t("Model answer (shown to the student after they hand in)")}>
              <Textarea id="l-model" rows={4} value={v.modelAnswer ?? ""} onChange={(e) => set("modelAnswer", e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <SubmitButton pending={isPending}>{t("Save lesson")}</SubmitButton>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>{t("Cancel")}</Link>
        </Button>
      </div>
    </form>
  )
}
