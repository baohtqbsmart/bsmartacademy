import { z } from "zod"

export const enrollSchema = z.object({
  studentId: z.uuid("Choose a student."),
  classId: z.uuid("Choose a class."),
  status: z.enum(["pending", "active"]),
  startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
})

export const enrollmentStatusSchema = z.object({
  enrollmentId: z.uuid(),
  status: z.enum(["pending", "active", "completed", "withdrawn"]),
})

export const transferSchema = z.object({
  enrollmentId: z.uuid(),
  classId: z.uuid("Choose a class."),
})
