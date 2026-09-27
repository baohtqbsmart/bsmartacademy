import { z } from "zod"

import { REVIEW_POLICIES } from "@/features/tests/questions"
import { academyInputToIso } from "@/lib/dates"
import { optionalInt, optionalText, requiredText } from "@/lib/validation"

const optionalDateTime = z
  .string()
  .trim()
  .refine((value) => value === "" || academyInputToIso(value) !== null, "Enter a valid date and time.")
  .transform((value) => (value === "" ? null : academyInputToIso(value)))

const decimal = (label: string, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim().replace(",", "."))
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= max, `${label} must be between 0 and ${max}.`)
    .transform(Number)

export const testSchema = z
  .object({
    classId: z.uuid("Choose a class."),
    title: requiredText(200, "Enter a title."),
    description: optionalText(5000),
    instructions: optionalText(10000),
    availableFrom: optionalDateTime,
    availableUntil: optionalDateTime,
    timeLimitMinutes: optionalInt(1, 600, "Time limit"),
    maxAttempts: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 20, "Attempts must be between 1 and 20.")
      .transform(Number),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    totalScore: decimal("Total score", 1000),
    reviewPolicy: z.enum(REVIEW_POLICIES),
  })
  .refine((v) => !v.availableFrom || !v.availableUntil || v.availableUntil > v.availableFrom, {
    message: "The closing time must be after the opening time.",
    path: ["availableUntil"],
  })

export type TestFormInput = z.input<typeof testSchema>
export type TestFormOutput = z.output<typeof testSchema>

export const testIdSchema = z.object({ testId: z.uuid() })

export const testLifecycleSchema = z.object({
  testId: z.uuid(),
  action: z.enum(["publish", "close", "reopen", "archive", "restore"]),
})

export const addQuestionsSchema = z.object({
  testId: z.uuid(),
  questionIds: z.array(z.uuid()).min(1, "Select at least one question.").max(100),
})

export const testQuestionIdSchema = z.object({ testQuestionId: z.uuid() })
export const moveTestQuestionSchema = z.object({ testQuestionId: z.uuid(), direction: z.enum(["up", "down"]) })
export const testQuestionPointsSchema = z.object({ testQuestionId: z.uuid(), points: decimal("Points", 100) })

// --- Students --------------------------------------------------------------

const index = z.number().int().min(-1).max(20)

/** Every response shape except files (spoken answers go through their own action). */
export const responseSchema = z.union([
  z.object({ choice: index }).strict(),
  z.object({ choices: z.array(index).max(8) }).strict(),
  z.object({ value: z.boolean() }).strict(),
  z.object({ pairs: z.array(index).max(10) }).strict(),
  z.object({ blanks: z.array(z.string().max(200)).max(20) }).strict(),
  z.object({ text: z.string().max(10000, "Answers can be at most 10,000 characters.") }).strict(),
  z.object({}).strict(),
])

export const saveAnswerSchema = z.object({ attemptId: z.uuid(), questionId: z.uuid(), response: responseSchema })
export const attemptIdSchema = z.object({ attemptId: z.uuid() })
export const spokenAnswerSchema = z.object({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(255),
})

// --- Grading ---------------------------------------------------------------

export const gradeAnswerSchema = z.object({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  score: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim().replace(",", "."))
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Enter a score with at most 2 decimals.")
    .transform(Number),
  feedback: optionalText(5000),
})
