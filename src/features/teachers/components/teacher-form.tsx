"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SelectField, TextareaField, TextField } from "@/components/shared/form-fields"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { STAFF_STATUS } from "@/config/labels"
import { createTeacherAction, updateTeacherAction } from "@/features/teachers/actions"
import {
  TEACHER_STATUSES,
  teacherSchema,
  type TeacherFormInput,
  type TeacherFormOutput,
} from "@/features/teachers/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type TeacherFormProps = {
  teacherId?: string
  defaultValues: TeacherFormInput
  cancelHref: string
}

export function TeacherForm({ teacherId, defaultValues, cancelHref }: TeacherFormProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<TeacherFormInput, unknown, TeacherFormOutput>({
    resolver: zodResolver(teacherSchema),
    defaultValues,
  })

  function onSubmit() {
    setFormError(null)
    const values = form.getValues()
    startTransition(async () => {
      const result = teacherId ? await updateTeacherAction(teacherId, values) : await createTeacherAction(values)
      if (!result.ok) setFormError(applyActionError(form, result.error))
    })
  }

  const { control } = form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6" noValidate>
        <FormAlert message={formError} />
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="teacherCode" label={t("Teacher code")} placeholder={t("GV005")} />
            <TextField control={control} name="fullName" label={t("Full name")} />
            <TextField control={control} name="email" label={t("Email")} type="email" />
            <TextField control={control} name="phone" label={t("Phone")} type="tel" />
            <TextField control={control} name="hiredOn" label={t("Start date")} type="date" />
            <SelectField
              control={control}
              name="status"
              label={t("Status")}
              options={TEACHER_STATUSES.map((s) => ({ value: s, label: STAFF_STATUS[s].label }))}
            />
            <TextareaField control={control} name="notes" label={t("Internal notes (staff only)")} className="sm:col-span-2" />
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-sm">
          {t("Subjects and qualifications are managed on the teacher's profile.")}
        </p>
        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{teacherId ? t("Save changes") : t("Add teacher")}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>{t("Cancel")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
