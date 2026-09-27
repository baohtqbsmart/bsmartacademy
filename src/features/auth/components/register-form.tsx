"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { MailCheckIcon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { routes } from "@/config/routes"
import { signUpAction } from "@/features/auth/actions"
import { signUpSchema } from "@/features/auth/schemas"
import { useT } from "@/i18n/client"
import { applyActionError } from "@/lib/action-result"

type Values = z.input<typeof signUpSchema>

export function RegisterForm() {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<Values, unknown, z.output<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", acceptTerms: false as unknown as true },
  })

  if (sentTo) {
    return (
      <div className="grid justify-items-center gap-3 text-center" role="status">
        <span className="bg-success/15 text-success flex size-12 items-center justify-center rounded-full">
          <MailCheckIcon className="size-6" aria-hidden />
        </span>
        <p className="font-medium">{t("Check your inbox")}</p>
        <p className="text-muted-foreground text-sm">
          {t("If {email} can be registered, we sent it a link to confirm the account. Open it to finish signing up.", { email: sentTo })}
        </p>
        <Link href={routes.login} className="text-primary text-sm font-medium hover:underline">
          {t("Back to sign in")}
        </Link>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit((values) => {
          setFormError(null)
          startTransition(async () => {
            const result = await signUpAction(values)
            if (!result.ok) setFormError(applyActionError(form, result.error))
            else setSentTo(values.email)
          })
        })}
      >
        <FormAlert message={formError} />
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Full name")}</FormLabel>
              <FormControl>
                <Input autoComplete="name" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Email")}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
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
              <FormLabel>{t("Password")}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>{t("At least 8 characters, with letters and numbers.")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("Confirm password")}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-2">
                <FormControl>
                  <Checkbox checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                </FormControl>
                <FormLabel className="leading-snug font-normal">
                  {t("I agree that BSmart Academy stores my name and e-mail to run my account.")}
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton pending={isPending} className="w-full">
          {t("Create account")}
        </SubmitButton>
        <p className="text-muted-foreground text-center text-sm">
          {t("Already have an account?")}{" "}
          <Link href={routes.login} className="text-primary font-medium underline-offset-4 hover:underline">
            {t("Sign in")}
          </Link>
        </p>
      </form>
    </Form>
  )
}
