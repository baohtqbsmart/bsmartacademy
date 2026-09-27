"use client"

import { PlusIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ASSIGNMENT_SKILLS, SKILL_LABELS } from "@/features/assignments/status"
import { saveQuestionAction } from "@/features/question-bank/actions"
import type { QuestionFormValues } from "@/features/question-bank/schemas"
import {
  CEFR_LABELS,
  CEFR_LEVELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  gradingLabel,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionType,
} from "@/features/tests/questions"
import type { FieldErrors } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type QuestionFormProps = {
  initial: QuestionFormValues
  subjects: { id: string; name: string }[]
  cancelHref: string
}

const NONE = "__none"

export function QuestionForm({ initial, subjects, cancelHref }: QuestionFormProps) {
  const tr = useT()
  const [v, setV] = useState<QuestionFormValues>(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = <K extends keyof QuestionFormValues>(key: K, value: QuestionFormValues[K]) => setV((c) => ({ ...c, [key]: value }))

  const type = v.questionType
  const isChoice = type === "multiple_choice" || type === "multiple_response" || (type === "listening" && v.listeningFormat === "choice")
  const blankCount = v.prompt.split("___").length - 1

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveQuestionAction(v)
      if (result && !result.ok) {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.[0] ? <p className="text-destructive text-sm">{tr(fieldErrors[name]![0])}</p> : null

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <FormAlert message={error} />
      <Card>
        <CardHeader>
          <CardTitle>{tr("Question")}</CardTitle>
          <CardDescription>{tr(gradingLabel(type, { format: v.listeningFormat }))}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="q-type" label={tr("Question type")}>
              <OptionSelect
                id="q-type"
                value={type}
                onChange={(value) => set("questionType", value as QuestionType)}
                options={QUESTION_TYPES.map((t) => ({ id: t, label: QUESTION_TYPE_LABELS[t] }))}
                placeholder={tr("Type")}
              />
            </Field>
            <Field id="q-points" label={tr("Score (points)")}>
              <Input id="q-points" inputMode="decimal" value={v.points} onChange={(e) => set("points", e.target.value)} />
              {fieldError("points")}
            </Field>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="q-prompt">{type === "fill_blank" ? tr("Question — write ___ for each blank") : tr("Question")}</Label>
            <Textarea id="q-prompt" rows={3} value={v.prompt} onChange={(e) => set("prompt", e.target.value)} />
            {type === "fill_blank" && <p className="text-muted-foreground text-xs">{tr("{blankCount} blank{value}", { blankCount, value: blankCount === 1 ? "" : "s" })}</p>}
            {fieldError("prompt")}
          </div>

          {(type === "sentence_transformation" || type === "error_correction") && (
            <Field id="q-source" label={type === "error_correction" ? tr("Sentence with the mistake") : tr("Sentence to rewrite")}>
              <Input id="q-source" value={v.sourceText} onChange={(e) => set("sourceText", e.target.value)} />
              {fieldError("sourceText")}
            </Field>
          )}

          {type === "listening" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{tr("Students answer by")}</legend>
              {(["choice", "text"] as const).map((format) => (
                <label key={format} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="listening-format"
                    className="accent-primary size-4"
                    checked={v.listeningFormat === format}
                    onChange={() => set("listeningFormat", format)}
                  />
                  {format === "choice" ? tr("Choosing an option (marked automatically)") : tr("Writing (marked by the teacher)")}
                </label>
              ))}
              <p className="text-muted-foreground text-xs">{tr("Upload the audio on the question page after saving.")}</p>
            </fieldset>
          )}

          {isChoice && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                {tr("Options — tick {value}", { value: type === "multiple_response" ? "every correct option" : "the correct option" })}
              </legend>
              {v.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type={type === "multiple_response" ? "checkbox" : "radio"}
                    name="correct-option"
                    className="accent-primary size-4"
                    aria-label={tr("Option {value} is correct", { value: index + 1 })}
                    checked={v.correct.includes(index)}
                    onChange={(e) =>
                      set(
                        "correct",
                        type === "multiple_response"
                          ? e.target.checked
                            ? [...v.correct, index]
                            : v.correct.filter((i) => i !== index)
                          : [index]
                      )
                    }
                  />
                  <Input
                    value={option}
                    aria-label={tr("Option {value}", { value: index + 1 })}
                    onChange={(e) => set("options", v.options.map((o, i) => (i === index ? e.target.value : o)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tr("Remove option {value}", { value: index + 1 })}
                    disabled={v.options.length <= 2}
                    onClick={() => {
                      set("options", v.options.filter((_, i) => i !== index))
                      set("correct", v.correct.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)))
                    }}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {v.options.length < 8 && (
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("options", [...v.options, ""])}>
                    <PlusIcon aria-hidden /> {tr("Add option")}
                  </Button>
                </div>
              )}
              {fieldError("options")}
              {fieldError("correct")}
            </fieldset>
          )}

          {type === "true_false" && (
            <fieldset className="flex flex-wrap items-center gap-4">
              <legend className="mb-1 text-sm font-medium">{tr("Correct answer")}</legend>
              {(["true", "false"] as const).map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="true-false"
                    className="accent-primary size-4"
                    checked={v.trueFalse === value}
                    onChange={() => set("trueFalse", value)}
                  />
                  {value === "true" ? tr("True") : tr("False")}
                </label>
              ))}
              {fieldError("trueFalse")}
            </fieldset>
          )}

          {type === "matching" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{tr("Pairs — the answers are shuffled for students")}</legend>
              {v.pairs.map((pair, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input
                    value={pair.left}
                    aria-label={tr("Item {value}", { value: index + 1 })}
                    placeholder={tr("Item")}
                    onChange={(e) => set("pairs", v.pairs.map((p, i) => (i === index ? { ...p, left: e.target.value } : p)))}
                  />
                  <Input
                    value={pair.right}
                    aria-label={tr("Match for item {value}", { value: index + 1 })}
                    placeholder={tr("Its match")}
                    onChange={(e) => set("pairs", v.pairs.map((p, i) => (i === index ? { ...p, right: e.target.value } : p)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tr("Remove pair {value}", { value: index + 1 })}
                    disabled={v.pairs.length <= 2}
                    onClick={() => set("pairs", v.pairs.filter((_, i) => i !== index))}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {v.pairs.length < 10 && (
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("pairs", [...v.pairs, { left: "", right: "" }])}>
                    <PlusIcon aria-hidden /> {tr("Add pair")}
                  </Button>
                </div>
              )}
              {fieldError("pairs")}
            </fieldset>
          )}

          {type === "fill_blank" && blankCount > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{tr("Accepted answers — separate alternatives with |")}</legend>
              {Array.from({ length: blankCount }, (_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 text-sm">{tr("Blank {value}", { value: index + 1 })}</span>
                  <Input
                    value={v.blanks[index] ?? ""}
                    aria-label={tr("Answers for blank {value}", { value: index + 1 })}
                    placeholder={tr("goes | walks")}
                    onChange={(e) => {
                      const blanks = [...v.blanks]
                      blanks[index] = e.target.value
                      set("blanks", blanks)
                    }}
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={v.caseSensitive} onCheckedChange={(checked) => set("caseSensitive", checked === true)} />
                {tr("Capital letters matter")}
              </label>
              {fieldError("blanks")}
            </fieldset>
          )}

          {(type === "short_answer" || type === "sentence_transformation" || type === "error_correction") && (
            <Field id="q-accepted" label={tr("Accepted answers (one per line, optional)")}>
              <Textarea id="q-accepted" rows={3} value={v.accepted} onChange={(e) => set("accepted", e.target.value)} />
              <p className="text-muted-foreground text-xs">
                {tr("Matching answers are marked automatically (ignoring capitals, extra spaces and a final full stop); others go to the teacher.")}
              </p>
            </Field>
          )}

          {type === "essay" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="q-min" label={tr("Minimum words (optional)")}>
                <Input id="q-min" inputMode="numeric" value={v.minWords} onChange={(e) => set("minWords", e.target.value)} />
              </Field>
              <Field id="q-max" label={tr("Maximum words (optional)")}>
                <Input id="q-max" inputMode="numeric" value={v.maxWords} onChange={(e) => set("maxWords", e.target.value)} />
                {fieldError("maxWords")}
              </Field>
            </div>
          )}

          {type === "speaking" && (
            <Field id="q-seconds" label={tr("Maximum recording length in seconds (optional)")}>
              <Input id="q-seconds" inputMode="numeric" className="w-32" value={v.maxSeconds} onChange={(e) => set("maxSeconds", e.target.value)} />
            </Field>
          )}

          <Field id="q-explanation" label={type === "essay" || type === "speaking" ? tr("Marking notes / model answer") : tr("Explanation")}>
            <Textarea id="q-explanation" rows={2} value={v.explanation} onChange={(e) => set("explanation", e.target.value)} />
            <p className="text-muted-foreground text-xs">{tr("Shown to students only when a test's review policy allows it.")}</p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Classification")}</CardTitle>
          <CardDescription>{tr("Used to search, filter and reuse the question.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="q-subject" label={tr("Subject")}>
            <OptionSelect id="q-subject" value={v.subjectId} onChange={(value) => set("subjectId", value)} options={subjects.map((s) => ({ id: s.id, label: s.name }))} placeholder={tr("Choose a subject")} />
            {fieldError("subjectId")}
          </Field>
          <Field id="q-skill" label={tr("Skill")}>
            <OptionSelect
              id="q-skill"
              value={v.skill || NONE}
              onChange={(value) => set("skill", value === NONE ? "" : value)}
              options={[{ id: NONE, label: "Not set" }, ...ASSIGNMENT_SKILLS.map((s) => ({ id: s, label: SKILL_LABELS[s] }))]}
              placeholder={tr("Skill")}
            />
          </Field>
          <Field id="q-cefr" label={tr("CEFR level")}>
            <OptionSelect
              id="q-cefr"
              value={v.cefrLevel || NONE}
              onChange={(value) => set("cefrLevel", value === NONE ? "" : value)}
              options={[{ id: NONE, label: "Not set" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: CEFR_LABELS[l] }))]}
              placeholder={tr("CEFR level")}
            />
          </Field>
          <Field id="q-difficulty" label={tr("Difficulty")}>
            <OptionSelect
              id="q-difficulty"
              value={v.difficulty}
              onChange={(value) => set("difficulty", value as QuestionFormValues["difficulty"])}
              options={DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LABELS[d] }))}
              placeholder={tr("Difficulty")}
            />
          </Field>
          <Field id="q-topic" label={tr("Topic")}>
            <Input id="q-topic" value={v.topic} onChange={(e) => set("topic", e.target.value)} placeholder={tr("Present simple")} />
          </Field>
          <Field id="q-tags" label={tr("Tags (comma separated)")}>
            <Input id="q-tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder={tr("flyers, unit-4")} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <SubmitButton pending={isPending}>{tr("Save question")}</SubmitButton>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>{tr("Cancel")}</Link>
        </Button>
      </div>
    </form>
  )
}
