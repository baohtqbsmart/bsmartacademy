"use client"

import { PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveLevelAction, saveSubjectAction } from "@/features/subjects/actions"

type SubjectValues = { subjectId?: string; code: string; name: string; description: string }

export function SubjectDialog({ initial }: { initial?: SubjectValues }) {
  const empty: SubjectValues = { code: "", name: "", description: "" }
  const [values, setValues] = useState<SubjectValues>(initial ?? empty)
  const set = (key: keyof SubjectValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="outline" size="sm">
            <PencilIcon aria-hidden /> Edit
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> Add subject
          </Button>
        )
      }
      title={initial ? "Edit subject" : "Add a subject"}
      submitLabel={initial ? "Save" : "Add subject"}
      successMessage={initial ? "Subject updated." : "Subject added."}
      onOpen={() => setValues(initial ?? empty)}
      onSubmit={() => saveSubjectAction(values)}
    >
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field id="subject-code" label="Code">
          <Input id="subject-code" value={values.code} onChange={set("code")} placeholder="ANH" />
        </Field>
        <Field id="subject-name" label="Name">
          <Input id="subject-name" value={values.name} onChange={set("name")} placeholder="Tiếng Anh" />
        </Field>
      </div>
      <Field id="subject-description" label="Description">
        <Textarea id="subject-description" rows={3} value={values.description} onChange={set("description")} />
      </Field>
    </ActionDialog>
  )
}

type LevelValues = { levelId?: string; code: string; name: string; sortOrder: string }

export function LevelDialog({ subjectId, initial, nextOrder }: { subjectId: string; initial?: LevelValues; nextOrder: number }) {
  const empty: LevelValues = { code: "", name: "", sortOrder: String(nextOrder) }
  const [values, setValues] = useState<LevelValues>(initial ?? empty)
  const set = (key: keyof LevelValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="sm">
            <PencilIcon aria-hidden /> Edit
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> Add level
          </Button>
        )
      }
      title={initial ? "Edit level" : "Add a level"}
      description="Levels are ordered from beginner to advanced by their order number."
      submitLabel={initial ? "Save" : "Add level"}
      successMessage={initial ? "Level updated." : "Level added."}
      onOpen={() => setValues(initial ?? empty)}
      onSubmit={() => saveLevelAction({ ...values, subjectId })}
    >
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr_6rem]">
        <Field id="level-code" label="Code">
          <Input id="level-code" value={values.code} onChange={set("code")} placeholder="KET" />
        </Field>
        <Field id="level-name" label="Name">
          <Input id="level-name" value={values.name} onChange={set("name")} placeholder="Cambridge KET (A2)" />
        </Field>
        <Field id="level-order" label="Order">
          <Input id="level-order" inputMode="numeric" value={values.sortOrder} onChange={set("sortOrder")} />
        </Field>
      </div>
    </ActionDialog>
  )
}
