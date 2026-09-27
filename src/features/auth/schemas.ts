import { z } from "zod"

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."))

/**
 * Sign-in also accepts academy login names without a public domain (e.g.
 * "hungpd@bsmart"): staff create those accounts directly, so they only need
 * the shape local@name, not a deliverable address.
 */
const loginName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+$/, "Enter your email or login name.")

export const signInSchema = z.object({
  email: loginName,
  password: z.string().min(1, "Enter your password."),
  /** Keep the session after the browser closes. */
  remember: z.boolean().default(true),
})

export const forgotPasswordSchema = z.object({ email })

const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/\p{L}/u, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.")

/** Website sign-up: creates a member account (see the members migration). */
export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your full name.").max(120, "Use at most 120 characters."),
    email,
    password: newPassword,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: "Please accept the terms to continue." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use at most 72 characters.")
      // Mirrors password_requirements = "letters_digits" in supabase/config.toml.
      .regex(/\p{L}/u, "Include at least one letter.")
      .regex(/\d/, "Include at least one number."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

/** Email link types accepted by /auth/confirm. */
export const emailOtpTypeSchema = z.enum([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
])
