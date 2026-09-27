"use server"

import { redirect } from "next/navigation"

import { routes, safeRedirectPath } from "@/config/routes"
import {
  forgotPasswordSchema,
  setPasswordSchema,
  signInSchema,
} from "@/features/auth/schemas"
import { runAction } from "@/lib/action"
import { requireUser } from "@/lib/auth/session"
import { getPublicEnv } from "@/lib/env"
import { fromAuthError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"

export async function signInAction(input: unknown, next?: string) {
  return runAction(signInSchema, input, async ({ email, password }) => {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw fromAuthError(error)
    redirect(safeRedirectPath(next))
  })
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(routes.login)
}

export async function requestPasswordResetAction(input: unknown) {
  return runAction(forgotPasswordSchema, input, async ({ email }) => {
    const supabase = await createClient()
    const redirectTo = new URL(routes.authConfirm, getPublicEnv().NEXT_PUBLIC_SITE_URL)
    redirectTo.searchParams.set("next", routes.setPassword)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    })
    // Never reveal whether an account exists; only surface rate limiting.
    if (error?.code?.startsWith("over_")) throw fromAuthError(error)
    if (error) console.error("[auth] password reset failed", error)
  })
}

export async function setPasswordAction(input: unknown) {
  return runAction(setPasswordSchema, input, async ({ password }) => {
    await requireUser()
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw fromAuthError(error)
    redirect(routes.dashboard)
  })
}
