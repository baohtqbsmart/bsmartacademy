import { z } from "zod"

export const issueCertificateSchema = z.object({
  classId: z.uuid("Choose a class."),
  studentId: z.uuid("Choose a student."),
  completionPercent: z.number().int().min(0).max(100).nullable(),
  note: z
    .string()
    .trim()
    .max(500, "Use at most 500 characters.")
    .transform((v) => v || null),
})

export const revokeCertificateSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, "Give a reason.").max(500, "Use at most 500 characters."),
})
