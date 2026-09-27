import { z } from "zod"

import { academyInputToIso, isIsoDate } from "@/lib/dates"
import { detectProvider, isValidMeetingUrl, MEETING_PROVIDERS, PROVIDERS } from "@/lib/meetings"
import { optionalText, requiredText } from "@/lib/validation"

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).")
const https = optionalText(1000).refine((v) => v === null || /^https:\/\/\S+$/.test(v), "Use a link starting with https://")

export const sessionSchema = z
  .object({
    sessionId: z.uuid().optional(),
    classId: z.uuid("Choose a class."),
    teacherId: z.uuid("Choose the teacher."),
    title: requiredText(200, "Give the session a title."),
    agenda: optionalText(5000),
    date: z.string().refine(isIsoDate, "Choose a date."),
    startTime: time,
    endTime: time,
    provider: z.enum(MEETING_PROVIDERS),
    meetingUrl: optionalText(500),
    meetingCode: optionalText(100),
    passcode: optionalText(100),
    recordingUrl: https,
  })
  .superRefine((v, ctx) => {
    if (v.endTime <= v.startTime) ctx.addIssue({ code: "custom", message: "The end must be after the start.", path: ["endTime"] })
    if (v.meetingUrl && !isValidMeetingUrl(v.provider, v.meetingUrl)) {
      const detected = detectProvider(v.meetingUrl)
      ctx.addIssue({
        code: "custom",
        message:
          detected && detected !== "other" && detected !== v.provider
            ? `This looks like a ${PROVIDERS[detected].label} link; choose ${PROVIDERS[detected].label} as the platform.`
            : `Paste a ${PROVIDERS[v.provider].label} meeting link, e.g. ${PROVIDERS[v.provider].example}`,
        path: ["meetingUrl"],
      })
    }
  })
  .transform((v) => ({
    ...v,
    startsAt: academyInputToIso(`${v.date}T${v.startTime}`)!,
    endsAt: academyInputToIso(`${v.date}T${v.endTime}`)!,
  }))

export type SessionFormInput = z.input<typeof sessionSchema>

export const sessionStatusSchema = z
  .object({
    sessionId: z.uuid(),
    action: z.enum(["start", "end", "reopen", "cancel", "restore"]),
    reason: optionalText(500),
  })
  .refine((v) => v.action !== "cancel" || v.reason, { message: "Give a reason (students see it).", path: ["reason"] })

export const materialLinkSchema = z.object({
  sessionId: z.uuid(),
  title: requiredText(200, "Name the material."),
  url: z.string().trim().max(1000).regex(/^https:\/\/\S+$/, "Use a link starting with https://"),
  visible: z.boolean(),
})

export const materialFileSchema = z.object({
  sessionId: z.uuid(),
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(255),
})

export const materialVisibilitySchema = z.object({ materialId: z.uuid(), visible: z.boolean() })
export const materialIdSchema = z.object({ materialId: z.uuid() })
export const homeworkSchema = z.object({ sessionId: z.uuid(), assignmentId: z.uuid() })
export const notesSchema = z.object({ sessionId: z.uuid(), notes: z.string().max(20000) })
export const sessionIdSchema = z.object({ sessionId: z.uuid() })
