"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm, type Control } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SelectField, TextareaField, TextField } from "@/components/shared/form-fields"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { createTestAction, updateTestAction } from "@/features/tests/actions"
import { REVIEW_POLICIES, REVIEW_POLICY_LABELS } from "@/features/tests/questions"
import { testSchema, type TestFormInput, type TestFormOutput } from "@/features/tests/schemas"
import { applyActionError } from "@/lib/action-result"

type TestFormProps = {
  testId?: string
  defaultValues: TestFormInput
  classes: { id: string; name: string }[]
  /** Scoring and randomisation freeze once students have started (the database refuses). */
  started?: boolean
  classLocked?: boolean
  cancelHref: string
}

export function TestForm({ testId, defaultValues, classes, started, classLocked, cancelHref }: TestFormProps) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<TestFormInput, unknown, TestFormOutput>({ resolver: zodResolver(testSchema), defaultValues })

  function onSubmit() {
    setFormError(null)
    const values = form.getValues()
    startTransition(async () => {
      const result = testId ? await updateTestAction(testId, values) : await createTestAction(values)
      if (result && !result.ok) setFormError(applyActionError(form, result.error))
    })
  }

  const { control } = form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6" noValidate>
        <FormAlert message={formError} />
        <Card>
          <CardHeader>
            <CardTitle>Test</CardTitle>
            <CardDescription>{testId ? "Changes apply straight away." : "Saved as a draft; add questions from the bank on its page."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="title" label="Title" className="sm:col-span-2" />
            {classLocked ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">Class</span>
                <span className="text-sm">{classes.find((c) => c.id === defaultValues.classId)?.name ?? "—"}</span>
              </div>
            ) : (
              <SelectField control={control} name="classId" label="Class" placeholder="Choose a class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            )}
            <TextareaField control={control} name="description" label="Description" rows={2} className="sm:col-span-2" />
            <TextareaField control={control} name="instructions" label="Instructions for students" rows={4} className="sm:col-span-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Timing and attempts</CardTitle>
            <CardDescription>Times are in Vietnam time. Leave empty for no limit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="availableFrom" label="Opens" type="datetime-local" />
            <TextField control={control} name="availableUntil" label="Closes" type="datetime-local" />
            <TextField control={control} name="timeLimitMinutes" label="Time limit (minutes)" inputMode="numeric" placeholder="None" />
            <TextField control={control} name="maxAttempts" label="Attempts allowed" inputMode="numeric" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scoring and security</CardTitle>
            <CardDescription>
              {started
                ? "Students have started: the total score and randomisation can no longer change."
                : "Scores are scaled to the total. Answers and marks per question are shown to students only as the review setting allows."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="totalScore" label="Total score" inputMode="decimal" disabled={started} />
            <SelectField
              control={control}
              name="reviewPolicy"
              label="Students see correct answers"
              options={REVIEW_POLICIES.map((p) => ({ value: p, label: REVIEW_POLICY_LABELS[p] }))}
            />
            <CheckboxField control={control} name="shuffleQuestions" label="Randomise the order of questions for each attempt" disabled={started} />
            <CheckboxField control={control} name="shuffleOptions" label="Randomise the order of options and matching answers" disabled={started} />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{testId ? "Save changes" : "Save draft"}</SubmitButton>
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
  disabled,
}: {
  control: Control<TestFormInput, unknown, TestFormOutput>
  name: "shuffleQuestions" | "shuffleOptions"
  label: string
  disabled?: boolean
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center gap-2 sm:col-span-2">
          <FormControl>
            <Checkbox checked={field.value} disabled={disabled} onCheckedChange={(checked) => field.onChange(checked === true)} />
          </FormControl>
          <FormLabel className="font-normal">{label}</FormLabel>
        </FormItem>
      )}
    />
  )
}
