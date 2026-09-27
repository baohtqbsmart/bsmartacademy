import { z } from "zod"

import { requiredText } from "@/lib/validation"

export const NOTIFICATION_KINDS = [
  "new_assignment",
  "homework_due",
  "new_grade",
  "absence",
  "schedule_change",
  "tuition_due",
  "new_announcement",
  "message",
  "system",
] as const

export const KIND_INFO: Record<(typeof NOTIFICATION_KINDS)[number], { label: string; description: string }> = {
  new_assignment: { label: "New assignments", description: "Work set for your (child's) class." },
  homework_due: { label: "Homework deadlines", description: "Due within 24 hours and not handed in yet." },
  new_grade: { label: "New grades and feedback", description: "When a teacher returns marks or feedback, and when a test is marked." },
  absence: { label: "Absences", description: "When a student is marked absent." },
  schedule_change: { label: "Schedule changes", description: "Timetable changes and online lessons scheduled, moved or cancelled." },
  tuition_due: { label: "Tuition due", description: "Invoices due within 7 days or overdue (parents)." },
  new_announcement: { label: "Announcements", description: "New announcements for you or your class." },
  message: { label: "Messages", description: "New messages in your teacher–parent conversations." },
  system: { label: "System notices", description: "Account and enrolment changes. These cannot be switched off." },
}

export const preferenceSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS).refine((k) => k !== "system", "System notices cannot be switched off."),
  enabled: z.boolean(),
})

export const markReadSchema = z.object({ ids: z.union([z.array(z.uuid()).max(200), z.literal("all")]) })

export const AUDIENCES = ["everyone", "staff", "parents", "students", "class"] as const
export const AUDIENCE_LABELS: Record<(typeof AUDIENCES)[number], string> = {
  everyone: "Everyone",
  staff: "Staff",
  parents: "All parents",
  students: "All students",
  class: "One class (its students, parents and teachers)",
}

export const announcementSchema = z
  .object({
    audience: z.enum(AUDIENCES),
    classId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
    title: requiredText(200, "Give the announcement a title."),
    body: requiredText(5000, "Write the announcement."),
    pinned: z.boolean(),
    expiresOn: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
  })
  .refine((v) => v.audience !== "class" || v.classId, { message: "Choose the class.", path: ["classId"] })

export const announcementIdSchema = z.object({ announcementId: z.uuid() })

export const startThreadSchema = z.object({ studentId: z.uuid(), teacherProfileId: z.uuid(), parentProfileId: z.uuid() })
export const messageSchema = z.object({ threadId: z.uuid(), body: requiredText(4000, "Write a message.") })
export const threadIdSchema = z.object({ threadId: z.uuid() })
