"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SelectField, TextField } from "@/components/shared/form-fields"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { CLASS_STATUS, DELIVERY_MODE_LABELS } from "@/config/labels"
import { createClassAction, updateClassAction } from "@/features/classes/actions"
import {
  CLASS_STATUSES,
  DELIVERY_MODES,
  classSchema,
  type ClassFormInput,
  type ClassFormOutput,
} from "@/features/classes/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type ClassFormProps = {
  classId?: string
  defaultValues: ClassFormInput
  courses: { id: string; code: string; name: string }[]
  cancelHref: string
}

export function ClassForm({ classId, defaultValues, courses, cancelHref }: ClassFormProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ClassFormInput, unknown, ClassFormOutput>({
    resolver: zodResolver(classSchema),
    defaultValues,
  })
  const deliveryMode = useWatch({ control: form.control, name: "deliveryMode" })

  function onSubmit() {
    setFormError(null)
    const values = form.getValues()
    startTransition(async () => {
      const result = classId ? await updateClassAction(classId, values) : await createClassAction(values)
      if (!result.ok) setFormError(applyActionError(form, result.error))
    })
  }

  const { control } = form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6" noValidate>
        <FormAlert message={formError} />
        <Card>
          <CardHeader>
            <CardTitle>{t("Class")}</CardTitle>
            <CardDescription>{t("Subject and level come from the course.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="code" label={t("Class code")} placeholder={t("PET-2026A")} />
            <TextField control={control} name="name" label={t("Name")} />
            <SelectField
              control={control}
              name="courseId"
              label={t("Course")}
              placeholder={t("Choose an active course")}
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            />
            <SelectField
              control={control}
              name="status"
              label={t("Status")}
              options={CLASS_STATUSES.map((s) => ({ value: s, label: CLASS_STATUS[s].label }))}
            />
            <TextField control={control} name="startDate" label={t("Start date")} type="date" />
            <TextField control={control} name="endDate" label={t("End date")} type="date" />
            <TextField control={control} name="capacity" label={t("Capacity")} inputMode="numeric" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Where")}</CardTitle>
            <CardDescription>{t("Time slots are added on the class page after saving.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={control}
              name="deliveryMode"
              label={t("Delivery")}
              options={DELIVERY_MODES.map((m) => ({ value: m, label: DELIVERY_MODE_LABELS[m] }))}
            />
            {deliveryMode !== "online" && <TextField control={control} name="room" label={t("Room")} placeholder="P202" />}
            {deliveryMode !== "in_person" && (
              <TextField
                control={control}
                name="meetingUrl"
                label={t("Meeting link")}
                placeholder={t("https://…")}
                className="sm:col-span-2"
              />
            )}
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{classId ? t("Save changes") : t("Create class")}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>{t("Cancel")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
