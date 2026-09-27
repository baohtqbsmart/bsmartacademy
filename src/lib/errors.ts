import type { AuthError, PostgrestError } from "@supabase/supabase-js"

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INTERNAL"

/**
 * Expected, user-presentable failure. Services throw AppError; the action layer
 * converts it into an ActionResult. Anything that is not an AppError is treated
 * as an unexpected bug: logged server-side and shown as a generic message.
 */
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "AppError"
    this.code = code
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
// https://docs.postgrest.org/en/stable/references/errors.html
const POSTGRES_CODE_MAP: Record<string, { code: ErrorCode; message: string }> = {
  "23505": { code: "CONFLICT", message: "This record already exists." },
  "23503": { code: "CONFLICT", message: "This record is referenced by other data." },
  "23514": { code: "VALIDATION", message: "The data violates a validation rule." },
  "42501": { code: "FORBIDDEN", message: "You do not have permission to do this." },
  P0002: { code: "NOT_FOUND", message: "The requested record was not found." },
  "22023": { code: "VALIDATION", message: "One of the values is not allowed." },
  PGRST116: { code: "NOT_FOUND", message: "The requested record was not found." },
}

// Codes whose database message is written for end users (raised by our own
// SQL functions and triggers), so it is shown instead of the generic text.
const USER_FACING_CODES = new Set(["42501", "P0002", "22023", "23514", "23505"])

/** Translate a Supabase database error into an AppError. */
export function fromPostgrestError(error: PostgrestError): AppError {
  const mapped = POSTGRES_CODE_MAP[error.code]
  if (mapped && USER_FACING_CODES.has(error.code) && isOwnMessage(error.message)) {
    return new AppError(mapped.code, error.message, { cause: error })
  }
  if (mapped) return new AppError(mapped.code, mapped.message, { cause: error })
  return new AppError("INTERNAL", "A database error occurred.", { cause: error })
}

// Postgres' own messages ("permission denied for table x", "new row violates
// check constraint ...") are lower-case technical text; ours are sentences.
function isOwnMessage(message: string) {
  return /^[A-Z].*\.$/.test(message)
}

/** Translate a Supabase auth error into an AppError. */
export function fromAuthError(error: AuthError): AppError {
  // Network failure: the auth server never answered (status 0), so this is not
  // a problem with what the user typed.
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return new AppError("INTERNAL", "The sign-in service cannot be reached. Please try again in a moment.", { cause: error })
  }
  switch (error.code) {
    case "invalid_credentials":
      return new AppError("UNAUTHENTICATED", "Incorrect email or password.", { cause: error })
    case "email_not_confirmed":
      return new AppError("UNAUTHENTICATED", "Please confirm your email address first.", { cause: error })
    case "reauthentication_needed":
      return new AppError("UNAUTHENTICATED", "For your security, sign in again (or use a new reset link) before changing your password.", { cause: error })
    case "weak_password":
      return new AppError("VALIDATION", "Choose a stronger password: at least 8 characters with letters and numbers.", { cause: error })
    case "user_banned":
      return new AppError("FORBIDDEN", "This account has been disabled.", { cause: error })
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return new AppError("FORBIDDEN", "Too many attempts. Please wait and try again.", { cause: error })
    default:
      return new AppError("INTERNAL", "Authentication failed. Please try again.", { cause: error })
  }
}
