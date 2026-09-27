"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { addFeedbackAction } from "@/features/students/actions"
import { feedbackSchema } from "@/features/students/schemas"
import { applyActionError } from "@/lib/action-result"

export function FeedbackForm({ studentId }: { studentId: string }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<z.input<typeof feedbackSchema>, unknown, z.output<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { studentId, body: "" },
  })

  function onSubmit(values: z.output<typeof feedbackSchema>) {
    setFormError(null)
    startTransition(async () => {
      const result = await addFeedbackAction(values)
      if (result.ok) {
        form.reset({ studentId, body: "" })
        toast.success("Feedback added.")
      } else {
        setFormError(applyActionError(form, result.error))
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3" noValidate>
        <FormAlert message={formError} />
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New feedback</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Progress, strengths, what to practise next…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <SubmitButton pending={isPending} size="sm">
            Add feedback
          </SubmitButton>
        </div>
      </form>
    </Form>
  )
}
