"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { routes, safeRedirectPath } from "@/config/routes"
import {
  forgotPasswordSchema,
  setPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas"
import { runAction } from "@/lib/action"
import { requireUser } from "@/lib/auth/session"
import { getPublicEnv } from "@/lib/env"
import { AppError, fromAuthError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookies"

export async function signInAction(input: unknown, next?: string) {
  return runAction(signInSchema, input, async ({ email, password, remember }) => {
    const cookieStore = await cookies()
    if (remember) cookieStore.delete(SESSION_ONLY_COOKIE)
    else cookieStore.set(SESSION_ONLY_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
    const supabase = await createClient({ sessionOnly: !remember })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw fromAuthError(error)
    redirect(safeRedirectPath(next))
  })
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(SESSION_ONLY_COOKIE)
  redirect(routes.login)
}

/**
 * Public sign-up from the website. The account is a member until staff give
 * it another role. Whether the e-mail already exists is never revealed.
 */
export async function signUpAction(input: unknown) {
  return runAction(signUpSchema, input, async ({ fullName, email, password }) => {
    const supabase = await createClient()
    const redirectTo = new URL(routes.authConfirm, getPublicEnv().NEXT_PUBLIC_SITE_URL)
    redirectTo.searchParams.set("next", routes.dashboard)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: redirectTo.toString() },
    })
    if (error?.code === "weak_password" || error?.code?.startsWith("over_")) throw fromAuthError(error)
    if (error) {
      console.error("[auth] sign-up failed", error)
      if (error.code === "signup_disabled") throw new AppError("FORBIDDEN", "Sign-up is not open yet. Please contact the academy office.")
      if (error.code !== "user_already_exists" && error.code !== "email_exists") throw fromAuthError(error)
    }
    // With e-mail confirmation on there is no session yet: the page asks the
    // user to check their inbox. Without it, they are signed in straight away.
    if (data?.session) redirect(routes.dashboard)
    return { checkEmail: true }
  })
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
