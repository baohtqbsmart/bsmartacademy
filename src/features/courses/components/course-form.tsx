"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SelectField, TextareaField, TextField } from "@/components/shared/form-fields"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { COURSE_STATUS } from "@/config/labels"
import { createCourseAction, updateCourseAction } from "@/features/courses/actions"
import {
  COURSE_STATUSES,
  courseSchema,
  type CourseFormInput,
  type CourseFormOutput,
} from "@/features/courses/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type SubjectOption = { id: string; name: string; levels: { id: string; name: string }[] }

type CourseFormProps = {
  courseId?: string
  defaultValues: CourseFormInput
  subjects: SubjectOption[]
  cancelHref: string
}

export function CourseForm({ courseId, defaultValues, subjects, cancelHref }: CourseFormProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<CourseFormInput, unknown, CourseFormOutput>({
    resolver: zodResolver(courseSchema),
    defaultValues,
  })
  const subjectId = useWatch({ control: form.control, name: "subjectId" })
  const levels = subjects.find((s) => s.id === subjectId)?.levels ?? []

  function onSubmit() {
    setFormError(null)
    const values = form.getValues()
    startTransition(async () => {
      const result = courseId ? await updateCourseAction(courseId, values) : await createCourseAction(values)
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
            <CardTitle>{t("Course")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="code" label={t("Course code")} placeholder={t("ANH-PET")} />
            <TextField control={control} name="name" label={t("Name")} />
            <SelectField
              control={control}
              name="subjectId"
              label={t("Subject")}
              placeholder={t("Choose a subject")}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
            <SelectField
              key={subjectId}
              control={control}
              name="levelId"
              label={t("Level")}
              optional
              options={levels.map((l) => ({ value: l.id, label: l.name }))}
            />
            <TextareaField control={control} name="description" label={t("Description")} className="sm:col-span-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Duration and status")}</CardTitle>
            <CardDescription>
              {t("Draft courses are visible only to course editors; only active courses can start new classes.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <TextField control={control} name="sessionCount" label={t("Sessions")} inputMode="numeric" />
            <TextField control={control} name="sessionMinutes" label={t("Minutes each")} inputMode="numeric" />
            <TextField control={control} name="durationWeeks" label={t("Weeks")} inputMode="numeric" />
            <SelectField
              control={control}
              name="status"
              label={t("Status")}
              options={COURSE_STATUSES.map((s) => ({ value: s, label: COURSE_STATUS[s].label }))}
            />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{courseId ? t("Save changes") : t("Create course")}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>{t("Cancel")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
