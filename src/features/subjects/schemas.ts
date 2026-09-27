import { z } from "zod"

import { codeField, optionalText, requiredText } from "@/lib/validation"

export const subjectSchema = z.object({
  subjectId: z.uuid().optional(),
  code: codeField("Subject code", 20),
  name: requiredText(100, "Enter a subject name."),
  description: optionalText(500).transform((value) => value ?? ""),
})

export const subjectIdSchema = z.object({ subjectId: z.uuid() })

export const levelSchema = z.object({
  levelId: z.uuid().optional(),
  subjectId: z.uuid(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,20}$/, "Level code may contain letters, digits and dashes only."),
  name: requiredText(100, "Enter a level name."),
  sortOrder: z.coerce.number().int("Order must be a whole number.").min(0).max(1000),
})

export const levelIdSchema = z.object({ levelId: z.uuid() })
