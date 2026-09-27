import { z } from "zod"

/**
 * Field builders shared by module schemas. Form inputs are strings; empty
 * strings become NULL so optional columns are stored as "not set".
 */
export const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Use at most ${max} characters.`)

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)

export const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date.")
  .transform((value) => value || null)

export const optionalPhone = optionalText(20).refine(
  (value) => value === null || /^\+?[0-9 .-]{6,20}$/.test(value),
  "Enter a valid phone number."
)

export const optionalEmail = optionalText(254).refine(
  (value) => value === null || z.email().safeParse(value).success,
  "Enter a valid email address."
)

/** "" -> null, otherwise a whole number within [min, max]. */
export const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max),
      `${label} must be a whole number between ${min} and ${max}.`
    )
    .transform((value) => (value === "" ? null : Number(value)))

/**
 * Whole-đồng amount typed by a person: "1.500.000", "1,500,000" and
 * "1 500 000" are all 1500000.
 */
export const moneyField = (label: string, { min = 1, max = 10_000_000_000 } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === "number" ? String(value) : value.replace(/[\s.,₫đ]/gi, "")))
    .refine((value) => /^\d+$/.test(value), `${label} must be a whole number of đồng.`)
    .transform(Number)
    .refine((value) => value >= min && value <= max, `${label} must be between ${min.toLocaleString("vi-VN")} and ${max.toLocaleString("vi-VN")} ₫.`)

/** Upper-case business code, e.g. "GV001", "TOAN6-2026A". */
export const codeField = (label: string, max = 30) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(new RegExp(`^[A-Z0-9-]{2,${max}}$`), `${label} may contain letters, digits and dashes only.`)

/** "" -> null for an optional id picked from a select. */
export const optionalUuid = z
  .union([z.uuid(), z.literal("")])
  .transform((value) => value || null)

export const optionalHttpsUrl = optionalText(500).refine(
  (value) => value === null || /^https:\/\/\S+$/.test(value),
  "Enter a link starting with https://"
)
