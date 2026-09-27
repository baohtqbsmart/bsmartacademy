"use server"

import { cookies } from "next/headers"
import { z } from "zod"

import { LOCALE_COOKIE, locales } from "@/i18n/config"
import { runAction } from "@/lib/action"

const setLocaleSchema = z.object({ locale: z.enum(locales) })

/**
 * Public by design (listed in tests/app/action-guards.test.ts): it only sets
 * the caller's own interface-language cookie, and the sign-in page offers it
 * before anyone is signed in.
 */
export async function setLocaleAction(input: unknown) {
  return runAction(setLocaleSchema, input, async ({ locale }) => {
    ;(await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    })
  })
}
