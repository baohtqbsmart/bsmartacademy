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
import { useT } from "@/i18n/client"

type UnitValues = { unitId?: string; title: string; description: string; sessionCount: string }

export function UnitDialog({ courseId, initial }: { courseId: string; initial?: UnitValues }) {
  const t = useT()
  const empty: UnitValues = { title: "", description: "", sessionCount: "" }
  const [values, setValues] = useState<UnitValues>(initial ?? empty)
  const set = (key: keyof UnitValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={t("Edit {title}", { title: initial.title })}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> {t("Add unit")}
          </Button>
        )
      }
      title={initial ? t("Edit unit") : t("Add a unit")}
      description={t("Units make up the course structure shared by every class of this course.")}
      submitLabel={initial ? t("Save") : t("Add unit")}
      successMessage={initial ? t("Unit updated.") : t("Unit added.")}
      onOpen={() => setValues(initial ?? empty)}
      onSubmit={() => saveUnitAction({ ...values, courseId })}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field id="unit-title" label={t("Title")}>
          <Input id="unit-title" value={values.title} onChange={set("title")} />
        </Field>
        <Field id="unit-sessions" label={t("Sessions")}>
          <Input id="unit-sessions" inputMode="numeric" value={values.sessionCount} onChange={set("sessionCount")} />
        </Field>
      </div>
      <Field id="unit-description" label={t("Description")}>
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
  const t = useT()
  const [isPending, startTransition] = useTransition()

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveUnitAction({ unitId: unit.id, direction })
      if (!result.ok) toast.error(result.error.message)
    })
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" disabled={isFirst || isPending} onClick={() => move("up")} aria-label={t("Move up")}>
        <ArrowUpIcon />
      </Button>
      <Button variant="ghost" size="icon" disabled={isLast || isPending} onClick={() => move("down")} aria-label={t("Move down")}>
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
        aria-label={t("Delete {title}", { title: unit.title })}
        title={t("Delete unit?")}
        description={t("\"{title}\" will be removed from the course structure.", { title: unit.title })}
        confirmLabel={t("Delete")}
        successMessage={t("Unit deleted.")}
        destructive
        action={() => deleteUnitAction({ unitId: unit.id })}
      >
        <Trash2Icon />
      </ConfirmActionButton>
    </div>
  )
}
