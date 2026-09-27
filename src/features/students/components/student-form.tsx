"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GENDER_LABELS, STUDENT_STATUS } from "@/config/labels"
import { createStudentAction, updateStudentAction } from "@/features/students/actions"
import { EnglishLevelSelect, type EnglishLevelOption } from "@/features/students/components/english-level-select"
import { STUDENT_STATUSES } from "@/features/students/list-query"
import {
  STUDENT_GENDERS,
  studentSchema,
  type StudentFormInput,
  type StudentFormOutput,
} from "@/features/students/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type StudentFormProps = {
  /** Present when editing an existing student. */
  studentId?: string
  defaultValues: StudentFormInput
  levels: EnglishLevelOption[]
  cancelHref: string
}

const NONE = "none"

export function StudentForm({ studentId, defaultValues, levels, cancelHref }: StudentFormProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<StudentFormInput, unknown, StudentFormOutput>({
    resolver: zodResolver(studentSchema),
    defaultValues,
  })

  function onSubmit() {
    setFormError(null)
    // Send the raw input: the server validates and normalises it again.
    const values = form.getValues()
    startTransition(async () => {
      const result = studentId ? await updateStudentAction(studentId, values) : await createStudentAction(values)
      if (!result.ok) setFormError(applyActionError(form, result.error))
    })
  }

  const text = (name: keyof StudentFormInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(label)}</FormLabel>
          <FormControl>
            <Input {...props} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6" noValidate>
        <FormAlert message={formError} />

        <Card>
          <CardHeader>
            <CardTitle>{t("Personal details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("fullName", "Full name", { autoComplete: "off" })}</div>
            {text("dateOfBirth", "Date of birth", { type: "date" })}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Gender")}</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("Not set")}</SelectItem>
                      {STUDENT_GENDERS.map((gender) => (
                        <SelectItem key={gender} value={gender}>
                          {t(GENDER_LABELS[gender])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text("schoolName", "School")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Contact")}</CardTitle>
            <CardDescription>{t("The student's own contact details, if they have any.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {text("phone", "Phone", { type: "tel" })}
            {text("email", "Email", { type: "email" })}
            <div className="sm:col-span-2">{text("address", "Address")}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Academy")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {text("joinedOn", "Enrollment date", { type: "date" })}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Status")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STUDENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(STUDENT_STATUS[status].label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(["englishLevelCode", "targetLevelCode"] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{name === "englishLevelCode" ? t("English level") : t("Target level")}</FormLabel>
                    <FormControl>
                      <EnglishLevelSelect
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        levels={levels}
                        placeholder={t("Not set")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Notes")}</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <SubmitButton pending={isPending}>{studentId ? t("Save changes") : t("Add student")}</SubmitButton>
          <Button variant="outline" asChild>
            <Link href={cancelHref}>{t("Cancel")}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
