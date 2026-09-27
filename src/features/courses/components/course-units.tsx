"use client"

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { deleteUnitAction, moveUnitAction, saveUnitAction } from "@/features/courses/actions"

type UnitValues = { unitId?: string; title: string; description: string; sessionCount: string }

export function UnitDialog({ courseId, initial }: { courseId: string; initial?: UnitValues }) {
  const empty: UnitValues = { title: "", description: "", sessionCount: "" }
  const [values, setValues] = useState<UnitValues>(initial ?? empty)
  const set = (key: keyof UnitValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.title}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> Add unit
          </Button>
        )
      }
      title={initial ? "Edit unit" : "Add a unit"}
      description="Units make up the course structure shared by every class of this course."
      submitLabel={initial ? "Save" : "Add unit"}
      successMessage={initial ? "Unit updated." : "Unit added."}
      onOpen={() => setValues(initial ?? empty)}
      onSubmit={() => saveUnitAction({ ...values, courseId })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field id="unit-title" label="Title">
          <Input id="unit-title" value={values.title} onChange={set("title")} />
        </Field>
        <Field id="unit-sessions" label="Sessions">
          <Input id="unit-sessions" inputMode="numeric" value={values.sessionCount} onChange={set("sessionCount")} />
        </Field>
      </div>
      <Field id="unit-description" label="Description">
        <Textarea id="unit-description" rows={3} value={values.description} onChange={set("description")} />
      </Field>
    </ActionDialog>
  )
}

export function UnitControls({
  courseId,
  unit,
  isFirst,
  isLast,
}: {
  courseId: string
  unit: { id: string; title: string; description: string; session_count: number | null }
  isFirst: boolean
  isLast: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveUnitAction({ unitId: unit.id, direction })
      if (!result.ok) toast.error(result.error.message)
    })
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" disabled={isFirst || isPending} onClick={() => move("up")} aria-label="Move up">
        <ArrowUpIcon />
      </Button>
      <Button variant="ghost" size="icon" disabled={isLast || isPending} onClick={() => move("down")} aria-label="Move down">
        <ArrowDownIcon />
      </Button>
      <UnitDialog
        courseId={courseId}
        initial={{
          unitId: unit.id,
          title: unit.title,
          description: unit.description,
          sessionCount: unit.session_count ? String(unit.session_count) : "",
        }}
      />
      <ConfirmActionButton
        variant="ghost"
        size="icon"
        aria-label={`Delete ${unit.title}`}
        title="Delete unit?"
        description={`"${unit.title}" will be removed from the course structure.`}
        confirmLabel="Delete"
        successMessage="Unit deleted."
        destructive
        action={() => deleteUnitAction({ unitId: unit.id })}
      >
        <Trash2Icon />
      </ConfirmActionButton>
    </div>
  )
}
