import "server-only"

import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"

import type { ActionResult, FieldErrors } from "@/lib/action-result"
import { isAppError } from "@/lib/errors"

/**
 * Standard wrapper for every Server Action:
 *   1. validates untrusted input with the given Zod schema,
 *   2. runs the handler,
 *   3. converts AppError into a typed failure, and hides unexpected errors.
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
    const fieldErrors: FieldErrors = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form"
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Please check the highlighted fields.", fieldErrors },
    }
  }

  try {
    return { ok: true, data: await handler(parsed.data) }
  } catch (error) {
    // Let Next.js control-flow errors (redirect, notFound) propagate.
    unstable_rethrow(error)

    if (isAppError(error)) {
      if (error.code === "INTERNAL") console.error("[action]", error.message, error.cause)
      return { ok: false, error: { code: error.code, message: error.message } }
    }

    console.error("[action] unexpected error", error)
    return {
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    }
  }
}
