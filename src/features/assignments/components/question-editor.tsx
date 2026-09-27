"use client"

import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { deleteQuestionAction, saveQuestionAction } from "@/features/assignments/actions"
import { QUESTION_KIND_LABELS, QUESTION_KINDS, type QuestionKind } from "@/features/assignments/status"
import { useT } from "@/i18n/client"

export type QuestionValues = {
  questionId?: string
  kind: QuestionKind
  prompt: string
  options: string[]
  points: string
  correctOption: number | null
  acceptedAnswers: string
  explanation: string
}

const EMPTY: QuestionValues = {
  kind: "multiple_choice",
  prompt: "",
  options: ["", ""],
  points: "1",
  correctOption: null,
  acceptedAnswers: "",
  explanation: "",
}

/** Add or edit one question together with its answer key. */
export function QuestionDialog({ assignmentId, initial }: { assignmentId: string; initial?: QuestionValues }) {
  const t = useT()
  const [v, setV] = useState<QuestionValues>(initial ?? EMPTY)
  const set = <K extends keyof QuestionValues>(key: K, value: QuestionValues[K]) => setV((c) => ({ ...c, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={t("Edit question")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> {t("Add question")}
          </Button>
        )
      }
      title={initial ? t("Edit question") : t("New question")}
      description={t("The answer key is only ever shown to the class's teachers.")}
      submitLabel={t("Save question")}
      successMessage={t("Question saved.")}
      onOpen={() => setV(initial ?? EMPTY)}
      onSubmit={() => saveQuestionAction({ ...v, assignmentId })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field id="q-kind" label={t("Type")}>
          <OptionSelect
            id="q-kind"
            value={v.kind}
            onChange={(value) => set("kind", value as QuestionKind)}
            options={QUESTION_KINDS.map((k) => ({ id: k, label: QUESTION_KIND_LABELS[k] }))}
            placeholder={t("Type")}
          />
        </Field>
        <Field id="q-points" label={t("Points")}>
          <Input id="q-points" inputMode="decimal" value={v.points} onChange={(e) => set("points", e.target.value)} />
        </Field>
      </div>
      <Field id="q-prompt" label={t("Question")}>
        <Textarea id="q-prompt" rows={3} value={v.prompt} onChange={(e) => set("prompt", e.target.value)} />
      </Field>

      {v.kind === "multiple_choice" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("Options — select the correct one")}</legend>
          {v.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                className="accent-primary size-4"
                aria-label={t("Option {value} is correct", { value: index + 1 })}
                checked={v.correctOption === index}
                onChange={() => set("correctOption", index)}
              />
              <Input
                value={option}
                aria-label={t("Option {value}", { value: index + 1 })}
                onChange={(e) => set("options", v.options.map((o, i) => (i === index ? e.target.value : o)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Remove option {value}", { value: index + 1 })}
                disabled={v.options.length <= 2}
                onClick={() => {
                  set("options", v.options.filter((_, i) => i !== index))
                  set("correctOption", v.correctOption === index ? null : v.correctOption !== null && v.correctOption > index ? v.correctOption - 1 : v.correctOption)
                }}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          {v.options.length < 8 && (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("options", [...v.options, ""])}>
                <PlusIcon aria-hidden /> {t("Add option")}
              </Button>
            </div>
          )}
        </fieldset>
      )}

      {v.kind === "short_answer" && (
        <Field id="q-accepted" label={t("Accepted answers (one per line)")}>
          <Textarea
            id="q-accepted"
            rows={3}
            value={v.acceptedAnswers}
            onChange={(e) => set("acceptedAnswers", e.target.value)}
            placeholder={t("5/6\nfive sixths")}
          />
        </Field>
      )}

      <div className="grid gap-2">
        <Label htmlFor="q-explanation">{v.kind === "long_answer" ? t("Model answer / marking notes") : t("Explanation (optional)")}</Label>
        <Textarea id="q-explanation" rows={2} value={v.explanation} onChange={(e) => set("explanation", e.target.value)} />
      </div>
    </ActionDialog>
  )
}

export function DeleteQuestionButton({ questionId }: { questionId: string }) {
  const t = useT()
  return (
    <ConfirmActionButton
      variant="ghost"
      size="icon"
      aria-label={t("Delete question")}
      title={t("Delete this question?")}
      description={t("The question and its answer key are deleted.")}
      confirmLabel={t("Delete")}
      successMessage={t("Question deleted.")}
      destructive
      action={deleteQuestionAction.bind(null, { questionId })}
    >
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
