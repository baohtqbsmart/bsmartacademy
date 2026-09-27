import { z } from "zod"

import {
  codeField,
  optionalDate,
  optionalHttpsUrl,
  optionalInt,
  optionalText,
  requiredText,
} from "@/lib/validation"

export const CLASS_STATUSES = ["planned", "active", "completed", "cancelled"] as const
export const DELIVERY_MODES = ["in_person", "online", "hybrid"] as const

const classFields = z.object({
  code: codeField("Class code", 30),
  name: requiredText(150, "Enter a class name."),
  courseId: z.uuid("Choose a course."),
  status: z.enum(CLASS_STATUSES),
  startDate: optionalDate,
  endDate: optionalDate,
  capacity: optionalInt(1, 500, "Capacity"),
  deliveryMode: z.enum(DELIVERY_MODES),
  room: optionalText(50),
  meetingUrl: optionalHttpsUrl,
})

type ClassFields = z.output<typeof classFields>

// Cross-field rules (the database enforces the same ones).
function withClassRules<T extends z.ZodType<ClassFields>>(schema: T) {
  return schema
    .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
      message: "The end date must be on or after the start date.",
      path: ["endDate"],
    })
    .refine((v) => v.deliveryMode === "in_person" || v.meetingUrl !== null, {
      message: "Online and hybrid classes need a meeting link.",
      path: ["meetingUrl"],
    })
}

export const classSchema = withClassRules(classFields)
export const updateClassSchema = withClassRules(classFields.extend({ classId: z.uuid() }))

export type ClassFormInput = z.input<typeof classFields>
export type ClassFormOutput = ClassFields

export const classIdSchema = z.object({ classId: z.uuid() })

export const assignTeacherSchema = z.object({
  classId: z.uuid(),
  teacherId: z.uuid("Choose a teacher."),
  role: z.enum(["lead_teacher", "assistant_teacher"]),
})

export const removeTeacherSchema = z.object({ classId: z.uuid(), teacherId: z.uuid() })

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).")

export const slotSchema = z
  .object({
    slotId: z.uuid().optional(),
    classId: z.uuid(),
    weekday: z.coerce.number().int().min(1, "Choose a day.").max(7, "Choose a day."),
    startsAt: time,
    endsAt: time,
    room: optionalText(50),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "The end time must be after the start time.", path: ["endsAt"] })

export const slotIdSchema = z.object({ slotId: z.uuid() })
