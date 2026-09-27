"use client"

import { PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addQualificationAction, setTeacherSubjectsAction } from "@/features/teachers/actions"
import { useT } from "@/i18n/client"

export function TeacherSubjectsDialog({
  teacherId,
  subjects,
  selected,
}: {
  teacherId: string
  subjects: { id: string; name: string }[]
  selected: string[]
}) {
  const t = useT()
  const [chosen, setChosen] = useState<string[]>(selected)

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <PencilIcon aria-hidden /> {t("Edit subjects")}
        </Button>
      }
      title={t("Subjects taught")}
      submitLabel={t("Save subjects")}
      successMessage={t("Subjects updated.")}
      onOpen={() => setChosen(selected)}
      onSubmit={() => setTeacherSubjectsAction({ teacherId, subjectIds: chosen })}
    >
      <fieldset className="grid gap-3">
        <legend className="sr-only">{t("Subjects")}</legend>
        {subjects.length === 0 && <p className="text-muted-foreground text-sm">{t("No subjects defined yet.")}</p>}
        {subjects.map((subject) => (
          <div key={subject.id} className="flex items-center gap-2">
            <Checkbox
              id={`subject-${subject.id}`}
              checked={chosen.includes(subject.id)}
              onCheckedChange={(checked) =>
                setChosen((current) =>
                  checked === true ? [...current, subject.id] : current.filter((id) => id !== subject.id)
                )
              }
            />
            <Label htmlFor={`subject-${subject.id}`} className="font-normal">
              {subject.name}
            </Label>
          </div>
        ))}
      </fieldset>
    </ActionDialog>
  )
}

export function AddQualificationDialog({ teacherId }: { teacherId: string }) {
  const t = useT()
  const [title, setTitle] = useState("")
  const [institution, setInstitution] = useState("")
  const [yearAwarded, setYearAwarded] = useState("")

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <PlusIcon aria-hidden /> {t("Add")}
        </Button>
      }
      title={t("Add a qualification")}
      submitLabel={t("Add qualification")}
      successMessage={t("Qualification added.")}
      onOpen={() => {
        setTitle("")
        setInstitution("")
        setYearAwarded("")
      }}
      onSubmit={() => addQualificationAction({ teacherId, title, institution, yearAwarded })}
    >
      <Field id="qual-title" label={t("Qualification")}>
        <Input id="qual-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("Cambridge CELTA")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="qual-institution" label={t("Institution")}>
          <Input id="qual-institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </Field>
        <Field id="qual-year" label={t("Year")}>
          <Input id="qual-year" inputMode="numeric" value={yearAwarded} onChange={(e) => setYearAwarded(e.target.value)} />
        </Field>
      </div>
    </ActionDialog>
  )
}
