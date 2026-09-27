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

type ClassFormProps = {
  classId?: string
  defaultValues: ClassFormInput
  courses: { id: string; code: string; name: string }[]
  cancelHref: string
}

export function ClassForm({ classId, defaultValues, courses, cancelHref }: ClassFormProps) {
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
            <CardTitle>Class</CardTitle>
            <CardDescription>Subject and level come from the course.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="code" label="Class code" placeholder="PET-2026A" />
            <TextField control={control} name="name" label="Name" />
            <SelectField
              control={control}
              name="courseId"
              label="Course"
              placeholder="Choose an active course"
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            />
            <SelectField
              control={control}
              name="status"
              label="Status"
              options={CLASS_STATUSES.map((s) => ({ value: s, label: CLASS_STATUS[s].label }))}
            />
            <TextField control={control} name="startDate" label="Start date" type="date" />
            <TextField control={control} name="endDate" label="End date" type="date" />
            <TextField control={control} name="capacity" label="Capacity" inputMode="numeric" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where</CardTitle>
            <CardDescription>Time slots are added on the class page after saving.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={control}
              name="deliveryMode"
              label="Delivery"
              options={DELIVERY_MODES.map((m) => ({ value: m, label: DELIVERY_MODE_LABELS[m] }))}
            />
            {deliveryMode !== "online" && <TextField control={control} name="room" label="Room" placeholder="P202" />}
            {deliveryMode !== "in_person" && (
              <TextField
                control={control}
                name="meetingUrl"
                label="Meeting link"
                placeholder="https://…"
                className="sm:col-span-2"
              />
            )}
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{classId ? "Save changes" : "Create class"}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
