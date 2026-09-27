import { z } from "zod"

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(120, "Use at most 120 characters."),
  phone: z
    .string()
    .trim()
    .max(20, "Use at most 20 characters.")
    .regex(/^(\+?[\d\s-]{6,})?$/, "Enter a valid phone number."),
})
