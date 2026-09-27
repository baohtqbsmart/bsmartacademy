import { z } from "zod"

import { optionalDate, optionalEmail, optionalPhone, optionalText } from "@/lib/validation"

const optionalCode = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[A-Z0-9_.-]{2,20}$/.test(value), "Choose a valid option.")
  .transform((value) => value || null)

export const STUDENT_GENDERS = ["male", "female", "other"] as const

/** Add / edit student form. Empty strings from inputs become NULL. */
export const studentSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the student's full name.").max(120, "Use at most 120 characters."),
    dateOfBirth: optionalDate.refine(
      (value) => value === null || new Date(value) < new Date(),
      "Date of birth must be in the past."
    ),
    gender: z
      .union([z.enum(STUDENT_GENDERS), z.literal("")])
      .transform((value) => value || null),
    phone: optionalPhone,
    email: optionalEmail,
    address: optionalText(300),
    schoolName: optionalText(150),
    joinedOn: optionalDate,
    englishLevelCode: optionalCode,
    targetLevelCode: optionalCode,
    status: z.enum(["active", "on_hold", "graduated", "withdrawn"]),
    notes: optionalText(2000),
  })

export type StudentFormInput = z.input<typeof studentSchema>
export type StudentFormOutput = z.output<typeof studentSchema>

export const studentIdSchema = z.object({ studentId: z.uuid() })

export const linkParentSchema = z.object({
  studentId: z.uuid(),
  parentId: z.uuid("Choose a parent."),
  relationship: z.enum(["father", "mother", "guardian", "grandparent", "other"]),
  isPrimaryContact: z.boolean(),
})

export const unlinkParentSchema = z.object({ studentId: z.uuid(), parentId: z.uuid() })

export const feedbackSchema = z.object({
  studentId: z.uuid(),
  body: z.string().trim().min(1, "Write some feedback.").max(4000, "Use at most 4000 characters."),
})

export const feedbackIdSchema = z.object({ feedbackId: z.uuid() })
