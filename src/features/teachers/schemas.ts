import { z } from "zod"

import {
  codeField,
  optionalDate,
  optionalEmail,
  optionalInt,
  optionalPhone,
  optionalText,
  requiredText,
} from "@/lib/validation"

export const TEACHER_STATUSES = ["active", "on_leave", "inactive"] as const

export const teacherSchema = z.object({
  teacherCode: codeField("Teacher code", 20),
  fullName: requiredText(120, "Enter the teacher's full name."),
  email: optionalEmail,
  phone: optionalPhone,
  hiredOn: optionalDate,
  status: z.enum(TEACHER_STATUSES),
  notes: optionalText(2000),
})

export type TeacherFormInput = z.input<typeof teacherSchema>
export type TeacherFormOutput = z.output<typeof teacherSchema>

export const teacherIdSchema = z.object({ teacherId: z.uuid() })

export const teacherSubjectsSchema = z.object({
  teacherId: z.uuid(),
  subjectIds: z.array(z.uuid()).max(50),
})

export const qualificationSchema = z.object({
  teacherId: z.uuid(),
  title: requiredText(200, "Enter the qualification."),
  institution: optionalText(200),
  yearAwarded: optionalInt(1950, 2100, "Year"),
})

export const qualificationIdSchema = z.object({ qualificationId: z.uuid() })
