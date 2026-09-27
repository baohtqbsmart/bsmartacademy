"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { requestPasswordResetAction } from "@/features/auth/actions"
import { forgotPasswordSchema } from "@/features/auth/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

export function ForgotPasswordForm() {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const form = useForm<
    z.input<typeof forgotPasswordSchema>,
    unknown,
    z.output<typeof forgotPasswordSchema>
  >({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  function onSubmit(values: z.output<typeof forgotPasswordSchema>) {
    setFormError(null)
    startTransition(async () => {
      const result = await requestPasswordResetAction(values)
      if (result.ok) setSent(true)
      else setFormError(applyActionError(form, result.error))
    })
  }

  if (sent) {
    return (
      <FormAlert
        variant="success"
        message={t("If an account exists for that email, a password reset link is on its way.")}
      />
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormAlert message={formError} />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Email")}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton pending={isPending} className="w-full">
          {t("Send reset link")}
        </SubmitButton>
      </form>
    </Form>
  )
}
