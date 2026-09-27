import { z } from "zod"

import { ASSIGNMENT_SKILLS, ASSIGNMENT_TYPES, QUESTION_KINDS } from "@/features/assignments/status"
import { academyInputToIso } from "@/lib/dates"
import { optionalInt, optionalText, requiredText } from "@/lib/validation"

/** "8", "9.5", "9,5" -> a score with at most 2 decimals within (min, max]. */
const scoreField = (label: string, { min = 0, max = 1000, allowZero = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim().replace(",", "."))
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), `${label} must be a number with at most 2 decimals.`)
    .transform(Number)
    .refine((value) => (allowZero ? value >= min : value > min) && value <= max, `${label} must be between ${min} and ${max}.`)

/** datetime-local input (academy time) -> ISO instant; "" -> null. */
const optionalDateTime = z
  .string()
  .trim()
  .refine((value) => value === "" || academyInputToIso(value) !== null, "Enter a valid date and time.")
  .transform((value) => (value === "" ? null : academyInputToIso(value)))

export const assignmentSchema = z.object({
  classId: z.uuid("Choose a class."),
  title: requiredText(200, "Enter a title."),
  assignmentType: z.enum(ASSIGNMENT_TYPES, "Choose a type."),
  skill: z.union([z.enum(ASSIGNMENT_SKILLS), z.literal("")]).transform((value) => value || null),
  description: optionalText(5000),
  instructions: optionalText(10000),
  dueAt: optionalDateTime,
  timeLimitMinutes: optionalInt(1, 600, "Time limit"),
  maxScore: scoreField("Maximum score", { allowZero: false }),
  allowLate: z.boolean(),
  requiresFile: z.boolean(),
})

export type AssignmentFormInput = z.input<typeof assignmentSchema>
export type AssignmentFormOutput = z.output<typeof assignmentSchema>

export const updateAssignmentSchema = assignmentSchema.extend({ assignmentId: z.uuid() })

export const lifecycleSchema = z
  .object({
    assignmentId: z.uuid(),
    action: z.enum(["publish", "schedule", "unschedule", "close", "reopen", "archive", "restore"]),
    publishAt: optionalDateTime.optional(),
  })
  .refine((v) => v.action !== "schedule" || Boolean(v.publishAt), {
    message: "Choose when to publish.",
    path: ["publishAt"],
  })

export const assignmentIdSchema = z.object({ assignmentId: z.uuid() })

export const questionSchema = z
  .object({
    assignmentId: z.uuid(),
    questionId: z.uuid().optional(),
    kind: z.enum(QUESTION_KINDS),
    prompt: requiredText(2000, "Write the question."),
    options: z.array(z.string().trim().max(300, "Options can be at most 300 characters.")).default([]),
    points: scoreField("Points", { allowZero: false }),
    correctOption: z.number().int().min(0).nullable().default(null),
    acceptedAnswers: z.string().default(""),
    explanation: optionalText(5000),
  })
  .transform((v) => ({
    ...v,
    options: v.kind === "multiple_choice" ? v.options.filter(Boolean) : [],
    acceptedAnswers: v.acceptedAnswers
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean),
  }))
  .refine((v) => v.kind !== "multiple_choice" || (v.options.length >= 2 && v.options.length <= 8), {
    message: "Give between 2 and 8 options.",
    path: ["options"],
  })
  .refine((v) => v.kind !== "multiple_choice" || (v.correctOption !== null && v.correctOption < v.options.length), {
    message: "Mark the correct option.",
    path: ["correctOption"],
  })
  .refine((v) => v.kind !== "short_answer" || v.acceptedAnswers.length > 0, {
    message: "Give at least one accepted answer (one per line).",
    path: ["acceptedAnswers"],
  })

export type QuestionInput = z.input<typeof questionSchema>

export const questionIdSchema = z.object({ questionId: z.uuid() })

const objectPath = z.string().min(1).max(300)
const fileName = z.string().trim().min(1, "The file needs a name.").max(255)

export const recordAttachmentSchema = z.object({ assignmentId: z.uuid(), objectPath, fileName })
export const attachmentIdSchema = z.object({ attachmentId: z.uuid() })

// ---------------------------------------------------------------------------
// Student work
// ---------------------------------------------------------------------------

const answer = z.union([
  z.object({ choice: z.number().int().min(0).max(7) }),
  z.object({ text: z.string().max(5000, "Answers can be at most 5000 characters.") }),
])

export const saveWorkSchema = z.object({
  submissionId: z.uuid(),
  answers: z.record(z.uuid(), answer),
  responseText: optionalText(20000),
})

export type SaveWorkInput = z.input<typeof saveWorkSchema>

export const submissionIdSchema = z.object({ submissionId: z.uuid() })
export const recordSubmissionFileSchema = z.object({ submissionId: z.uuid(), objectPath, fileName })
export const submissionFileIdSchema = z.object({ fileId: z.uuid() })

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export const gradeSchema = z.object({
  submissionId: z.uuid(),
  score: scoreField("Score"),
  feedback: optionalText(5000),
  publish: z.boolean(),
})

export const returnGradesSchema = z.object({ assignmentId: z.uuid(), submissionId: z.uuid().optional() })
export const resubmissionSchema = z.object({ submissionId: z.uuid(), allowed: z.boolean() })
