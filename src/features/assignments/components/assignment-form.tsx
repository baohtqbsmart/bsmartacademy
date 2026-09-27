"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm, useWatch, type Control } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SelectField, TextareaField, TextField } from "@/components/shared/form-fields"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { createAssignmentAction, updateAssignmentAction } from "@/features/assignments/actions"
import { assignmentSchema, type AssignmentFormInput, type AssignmentFormOutput } from "@/features/assignments/schemas"
import { ASSIGNMENT_SKILLS, ASSIGNMENT_TYPE_LABELS, ASSIGNMENT_TYPES, SKILL_LABELS } from "@/features/assignments/status"
import { applyActionError } from "@/lib/action-result"

type ClassOption = { id: string; name: string; course: string | null; level: string | null }

type AssignmentFormProps = {
  assignmentId?: string
  defaultValues: AssignmentFormInput
  classes: ClassOption[]
  /** The class cannot change after publication (the database refuses it). */
  classLocked?: boolean
  cancelHref: string
}

export function AssignmentForm({ assignmentId, defaultValues, classes, classLocked, cancelHref }: AssignmentFormProps) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<AssignmentFormInput, unknown, AssignmentFormOutput>({
    resolver: zodResolver(assignmentSchema),
    defaultValues,
  })
  const classId = useWatch({ control: form.control, name: "classId" })
  const selected = classes.find((c) => c.id === classId)

  function onSubmit() {
    setFormError(null)
    const values = form.getValues()
    startTransition(async () => {
      const result = assignmentId ? await updateAssignmentAction(assignmentId, values) : await createAssignmentAction(values)
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
            <CardTitle>Assignment</CardTitle>
            <CardDescription>
              {assignmentId ? "Changes apply straight away." : "It is saved as a draft; publish or schedule it from its page."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="title" label="Title" className="sm:col-span-2" />
            {classLocked ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">Class</span>
                <span className="text-sm">{selected?.name ?? "—"}</span>
              </div>
            ) : (
              <SelectField
                control={control}
                name="classId"
                label="Class"
                placeholder="Choose a class"
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
            <div className="grid gap-2">
              <span className="text-sm font-medium">Course · level</span>
              <span className="text-muted-foreground text-sm">
                {selected ? [selected.course, selected.level].filter(Boolean).join(" · ") || "—" : "From the class"}
              </span>
            </div>
            <SelectField
              control={control}
              name="assignmentType"
              label="Type"
              options={ASSIGNMENT_TYPES.map((t) => ({ value: t, label: ASSIGNMENT_TYPE_LABELS[t] }))}
            />
            <SelectField
              control={control}
              name="skill"
              label="Skill"
              optional
              options={ASSIGNMENT_SKILLS.map((s) => ({ value: s, label: SKILL_LABELS[s] }))}
            />
            <TextareaField control={control} name="description" label="Description" rows={2} className="sm:col-span-2" />
            <TextareaField control={control} name="instructions" label="Instructions for students" rows={6} className="sm:col-span-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deadline and marking</CardTitle>
            <CardDescription>Times are in Vietnam time. Questions and attachments are added on the assignment page.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField control={control} name="dueAt" label="Due" type="datetime-local" />
            <TextField control={control} name="timeLimitMinutes" label="Time limit (minutes)" inputMode="numeric" placeholder="None" />
            <TextField control={control} name="maxScore" label="Maximum score" inputMode="decimal" />
            <CheckboxField control={control} name="allowLate" label="Accept late work (marked as late)" />
            <CheckboxField control={control} name="requiresFile" label="Students must upload a file" />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{assignmentId ? "Save changes" : "Save draft"}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}

function CheckboxField({
  control,
  name,
  label,
}: {
  control: Control<AssignmentFormInput, unknown, AssignmentFormOutput>
  name: "allowLate" | "requiresFile"
  label: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center gap-2 sm:col-span-3">
          <FormControl>
            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
          </FormControl>
          <FormLabel className="font-normal">{label}</FormLabel>
        </FormItem>
      )}
    />
  )
}
