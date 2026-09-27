import { z } from "zod"

import { CATEGORIES } from "@/features/assessments/scoring"
import { CEFR_LEVELS } from "@/features/tests/questions"
import { academyInputToIso } from "@/lib/dates"
import { optionalInt, optionalText, requiredText } from "@/lib/validation"

const criteria = z
  .array(z.object({ name: z.string().trim().max(100), description: z.string().trim().max(1000), maxPoints: z.string().trim() }))
  .transform((items) => items.filter((c) => c.name))

export const taskSchema = z
  .object({
    taskId: z.uuid().optional(),
    classId: z.uuid("Choose a class."),
    kind: z.enum(["writing", "speaking"]),
    title: requiredText(200, "Enter a title."),
    cefrLevel: z.union([z.enum(CEFR_LEVELS), z.literal("")]).transform((v) => v || null),
    task: requiredText(10000, "Write the task."),
    instructions: optionalText(10000),
    responseMode: z.enum(["online_text", "document", "online_or_document", "audio", "video", "audio_or_video"]),
    minWords: optionalInt(1, 5000, "Minimum words"),
    maxWords: optionalInt(1, 5000, "Maximum words"),
    maxDurationSeconds: optionalInt(10, 1800, "Maximum length"),
    rubricId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
    scoring: z.enum(["points", "ielts_band"]),
    criteria,
    maxAttempts: optionalInt(1, 10, "Attempts").transform((v) => v ?? 1),
    dueAt: z
      .string()
      .trim()
      .refine((v) => v === "" || academyInputToIso(v) !== null, "Enter a valid date and time.")
      .transform((v) => (v === "" ? null : academyInputToIso(v))),
    allowLate: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const writing = v.kind === "writing"
    if (writing !== ["online_text", "document", "online_or_document"].includes(v.responseMode)) {
      ctx.addIssue({ code: "custom", message: "Choose how students answer.", path: ["responseMode"] })
    }
    if (v.minWords && v.maxWords && v.minWords > v.maxWords) {
      ctx.addIssue({ code: "custom", message: "The maximum must be at least the minimum.", path: ["maxWords"] })
    }
    if (v.criteria.length === 0) ctx.addIssue({ code: "custom", message: "Add at least one criterion.", path: ["criteria"] })
    v.criteria.forEach((c, i) => {
      const n = Number(c.maxPoints.replace(",", "."))
      const ok = v.scoring === "ielts_band" ? n === 9 : n > 0 && n <= 100
      if (!ok) ctx.addIssue({ code: "custom", message: `Criterion ${i + 1}: ${v.scoring === "ielts_band" ? "bands go up to 9" : "points between 1 and 100"}.`, path: ["criteria"] })
    })
  })

export type TaskFormInput = z.input<typeof taskSchema>

export const taskActionSchema = z.object({
  taskId: z.uuid(),
  action: z.enum(["publish", "close", "reopen", "archive", "restore"]),
})
export const taskIdSchema = z.object({ taskId: z.uuid() })

export const submitSchema = z.object({
  taskId: z.uuid(),
  text: optionalText(50000),
  file: z.object({ objectPath: z.string().min(1).max(300), fileName: z.string().min(1).max(255) }).nullable(),
})

export const gradeSchema = z.object({
  submissionId: z.uuid(),
  scores: z.array(z.number().min(0).max(100)).min(1).max(10),
  feedback: optionalText(10000),
  publish: z.boolean(),
})

export const returnSchema = z.object({ taskId: z.uuid(), submissionId: z.uuid().optional() })
export const resubmissionSchema = z.object({ submissionId: z.uuid(), allowed: z.boolean() })

const note = {
  category: z.enum(CATEGORIES),
  comment: optionalText(2000),
  suggestion: optionalText(2000),
}

export const annotationSchema = z
  .object({
    submissionId: z.uuid(),
    anchor: z.enum(["text", "time", "general"]),
    start: z.number().int().min(0).nullable(),
    end: z.number().int().min(1).nullable(),
    time: z.number().min(0).max(36000).nullable(),
    ...note,
  })
  .refine((v) => v.comment || v.suggestion, { message: "Write a comment or a suggested correction.", path: ["comment"] })

export const updateAnnotationSchema = z
  .object({ annotationId: z.uuid(), ...note })
  .refine((v) => v.comment || v.suggestion, { message: "Write a comment or a suggested correction.", path: ["comment"] })
export const annotationIdSchema = z.object({ annotationId: z.uuid() })

export const rubricSchema = z.object({
  rubricId: z.uuid().optional(),
  name: requiredText(150, "Name the rubric."),
  kind: z.enum(["writing", "speaking"]),
  scoring: z.enum(["points", "ielts_band"]),
  description: optionalText(2000),
  criteria,
})

export const commentSchema = z.object({
  commentId: z.uuid().optional(),
  kind: z.union([z.enum(["writing", "speaking"]), z.literal("")]).transform((v) => v || null),
  category: z.enum(CATEGORIES),
  body: requiredText(1000, "Write the comment."),
  shared: z.boolean(),
})
export const commentIdSchema = z.object({ commentId: z.uuid() })
