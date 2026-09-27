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
  const [v, setV] = useState<QuestionValues>(initial ?? EMPTY)
  const set = <K extends keyof QuestionValues>(key: K, value: QuestionValues[K]) => setV((c) => ({ ...c, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label="Edit question">
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> Add question
          </Button>
        )
      }
      title={initial ? "Edit question" : "New question"}
      description="The answer key is only ever shown to the class's teachers."
      submitLabel="Save question"
      successMessage="Question saved."
      onOpen={() => setV(initial ?? EMPTY)}
      onSubmit={() => saveQuestionAction({ ...v, assignmentId })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field id="q-kind" label="Type">
          <OptionSelect
            id="q-kind"
            value={v.kind}
            onChange={(value) => set("kind", value as QuestionKind)}
            options={QUESTION_KINDS.map((k) => ({ id: k, label: QUESTION_KIND_LABELS[k] }))}
            placeholder="Type"
          />
        </Field>
        <Field id="q-points" label="Points">
          <Input id="q-points" inputMode="decimal" value={v.points} onChange={(e) => set("points", e.target.value)} />
        </Field>
      </div>
      <Field id="q-prompt" label="Question">
        <Textarea id="q-prompt" rows={3} value={v.prompt} onChange={(e) => set("prompt", e.target.value)} />
      </Field>

      {v.kind === "multiple_choice" && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Options — select the correct one</legend>
          {v.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                className="accent-primary size-4"
                aria-label={`Option ${index + 1} is correct`}
                checked={v.correctOption === index}
                onChange={() => set("correctOption", index)}
              />
              <Input
                value={option}
                aria-label={`Option ${index + 1}`}
                onChange={(e) => set("options", v.options.map((o, i) => (i === index ? e.target.value : o)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove option ${index + 1}`}
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
                <PlusIcon aria-hidden /> Add option
              </Button>
            </div>
          )}
        </fieldset>
      )}

      {v.kind === "short_answer" && (
        <Field id="q-accepted" label="Accepted answers (one per line)">
          <Textarea
            id="q-accepted"
            rows={3}
            value={v.acceptedAnswers}
            onChange={(e) => set("acceptedAnswers", e.target.value)}
            placeholder={"5/6\nfive sixths"}
          />
        </Field>
      )}

      <div className="grid gap-2">
        <Label htmlFor="q-explanation">{v.kind === "long_answer" ? "Model answer / marking notes" : "Explanation (optional)"}</Label>
        <Textarea id="q-explanation" rows={2} value={v.explanation} onChange={(e) => set("explanation", e.target.value)} />
      </div>
    </ActionDialog>
  )
}

export function DeleteQuestionButton({ questionId }: { questionId: string }) {
  return (
    <ConfirmActionButton
      variant="ghost"
      size="icon"
      aria-label="Delete question"
      title="Delete this question?"
      description="The question and its answer key are deleted."
      confirmLabel="Delete"
      successMessage="Question deleted."
      destructive
      action={deleteQuestionAction.bind(null, { questionId })}
    >
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
