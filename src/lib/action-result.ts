import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form"

import type { ErrorCode } from "@/lib/errors"

export type FieldErrors = Record<string, string[] | undefined>

/** Serializable result returned by every Server Action. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } }

/**
 * Pushes server-side validation errors into a React Hook Form instance.
 * Returns the form-level message for display (toast / alert).
 */
export function applyActionError<T extends FieldValues, TContext, TTransformed>(
  form: UseFormReturn<T, TContext, TTransformed>,
  error: Extract<ActionResult, { ok: false }>["error"]
) {
  for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
    if (field !== "_form" && messages?.length) {
      form.setError(field as FieldPath<T>, { type: "server", message: messages[0] })
    }
  }
  return error.message
}
