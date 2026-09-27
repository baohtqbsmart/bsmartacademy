import "server-only"

import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"

import { getT } from "@/i18n/server"
import type { TFunction } from "@/i18n/translate"
import type { ActionResult, FieldErrors } from "@/lib/action-result"
import { isAppError } from "@/lib/errors"

/** Messages are written in English; they reach the user in their language. */
async function translator(): Promise<TFunction> {
  try {
    return await getT()
  } catch {
    // Outside a request (unit tests): keep the English text.
    return (text) => text
  }
}

/**
 * Standard wrapper for every Server Action:
 *   1. validates untrusted input with the given Zod schema,
 *   2. runs the handler,
 *   3. converts AppError into a typed failure, and hides unexpected errors,
 *   4. translates every message into the caller's interface language.
 * Server Actions are public HTTP endpoints, so handlers must still perform
 * their own authentication/authorization (requireUser / requirePermission).
 */
export async function runAction<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  input: unknown,
  handler: (data: z.output<TSchema>) => Promise<TResult>
): Promise<ActionResult<TResult>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const t = await translator()
    const fieldErrors: FieldErrors = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form"
      ;(fieldErrors[key] ??= []).push(t(issue.message))
    }
    return {
      ok: false,
      error: { code: "VALIDATION", message: t("Please check the highlighted fields."), fieldErrors },
    }
  }

  try {
    return { ok: true, data: await handler(parsed.data) }
  } catch (error) {
    // Let Next.js control-flow errors (redirect, notFound) propagate.
    unstable_rethrow(error)
    const t = await translator()

    if (isAppError(error)) {
      if (error.code === "INTERNAL") console.error("[action]", error.message, error.cause)
      return { ok: false, error: { code: error.code, message: t(error.message) } }
    }

    console.error("[action] unexpected error", error)
    return {
      ok: false,
      error: { code: "INTERNAL", message: t("Something went wrong. Please try again.") },
    }
  }
}
