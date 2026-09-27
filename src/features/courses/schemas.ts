import { z } from "zod"

import { codeField, optionalInt, optionalText, optionalUuid, requiredText } from "@/lib/validation"

export const COURSE_STATUSES = ["draft", "active", "inactive"] as const

export const courseSchema = z.object({
  code: codeField("Course code", 30),
  name: requiredText(150, "Enter a course name."),
  description: optionalText(2000).transform((value) => value ?? ""),
  subjectId: z.uuid("Choose a subject."),
  levelId: optionalUuid,
  sessionCount: optionalInt(1, 500, "Sessions"),
  sessionMinutes: optionalInt(15, 600, "Minutes per session"),
  durationWeeks: optionalInt(1, 260, "Duration"),
  status: z.enum(COURSE_STATUSES),
})

export type CourseFormInput = z.input<typeof courseSchema>
export type CourseFormOutput = z.output<typeof courseSchema>

export const courseIdSchema = z.object({ courseId: z.uuid() })

export const unitSchema = z.object({
  unitId: z.uuid().optional(),
  courseId: z.uuid(),
  title: requiredText(200, "Enter a unit title."),
  description: optionalText(2000).transform((value) => value ?? ""),
  sessionCount: optionalInt(1, 200, "Sessions"),
})

export const unitIdSchema = z.object({ unitId: z.uuid() })

export const moveUnitSchema = z.object({ unitId: z.uuid(), direction: z.enum(["up", "down"]) })
