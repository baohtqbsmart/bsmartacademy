import { z } from "zod"

import { ATTENDANCE_STATUSES } from "@/features/attendance/summary"
import { isIsoDate } from "@/lib/dates"

const isoDate = z.string().refine(isIsoDate, "Choose a valid date.")
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .optional()
    .transform((value) => value || null)

export const attendanceEntrySchema = z.object({
  studentId: z.uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  // Only meaningful for present/late students in hybrid classes; the
  // database fills in and checks the class's mode.
  attendedVia: z.enum(["in_person", "online"]).nullable().default(null),
  minutesLate: z.coerce.number().int().min(1, "At least 1 minute.").max(240, "At most 240 minutes.").nullable().default(null),
  note: optionalText(500),
})

export const saveAttendanceSchema = z.object({
  classId: z.uuid(),
  date: isoDate,
  notes: optionalText(1000),
  entries: z
    .array(attendanceEntrySchema)
    .min(1, "There are no students to mark.")
    .refine((entries) => new Set(entries.map((e) => e.studentId)).size === entries.length, "Each student can only be marked once."),
})

export type SaveAttendanceInput = z.input<typeof saveAttendanceSchema>
export type SaveAttendanceOutput = z.output<typeof saveAttendanceSchema>

export const deleteRegisterSchema = z.object({ sessionId: z.uuid() })
