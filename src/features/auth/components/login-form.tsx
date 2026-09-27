"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
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
import { routes } from "@/config/routes"
import { signInAction } from "@/features/auth/actions"
import { signInSchema } from "@/features/auth/schemas"
import { applyActionError } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type LoginFormProps = {
  next?: string
  initialError?: string | null
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState(initialError ?? null)

  const form = useForm<z.input<typeof signInSchema>, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })

  function onSubmit(values: z.output<typeof signInSchema>) {
    setFormError(null)
    startTransition(async () => {
      const result = await signInAction(values, next)
      if (!result.ok) setFormError(applyActionError(form, result.error))
    })
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
              <FormLabel>{t("Email or login name")}</FormLabel>
              <FormControl>
                <Input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>{t("Password")}</FormLabel>
                <Link
                  href={routes.forgotPassword}
                  className="text-muted-foreground text-sm underline-offset-4 hover:underline"
                >
                  {t("Forgot password?")}
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton pending={isPending} className="w-full">
          {t("Sign in")}
        </SubmitButton>
      </form>
    </Form>
  )
}
