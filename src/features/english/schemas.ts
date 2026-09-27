import { z } from "zod"

import { ACTIVITIES, LESSON_SKILLS, PARTS_OF_SPEECH, isWorkSkill } from "@/features/english/skills"
import { responseSchema } from "@/features/tests/schemas"
import { CEFR_LEVELS } from "@/features/tests/questions"
import { optionalInt, optionalText, requiredText } from "@/lib/validation"

const list = z
  .string()
  .max(2000)
  .transform((value) =>
    value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
  )
const lines = z
  .string()
  .max(10000)
  .transform((value) =>
    value
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean)
  )
const cefr = z.union([z.enum(CEFR_LEVELS), z.literal("")]).transform((v) => v || null)
const positive = (label: string, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(",", "."))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= max, `${label} must be between 0 and ${max}.`)
    .transform(Number)

// --- Vocabulary ------------------------------------------------------------

export const wordSchema = z.object({
  wordId: z.uuid().optional(),
  word: requiredText(100, "Enter the word."),
  ipa: optionalText(100),
  partOfSpeech: z.enum(PARTS_OF_SPEECH),
  meaningVi: requiredText(500, "Enter the Vietnamese meaning."),
  definitionEn: optionalText(1000),
  example: optionalText(1000),
  collocations: list,
  synonyms: list,
  antonyms: list,
  cefrLevel: cefr,
  topic: optionalText(100),
  published: z.boolean(),
})

export type WordFormInput = z.input<typeof wordSchema>

const upload = { objectPath: z.string().min(1).max(300), fileName: z.string().min(1).max(255) }

export const wordMediaSchema = z.object({ wordId: z.uuid(), field: z.enum(["audio", "image"]), ...upload })
export const clearWordMediaSchema = z.object({ wordId: z.uuid(), field: z.enum(["audio", "image"]) })
export const wordStatusSchema = z.object({ wordId: z.uuid(), status: z.enum(["draft", "published", "archived"]) })

export const setSchema = z.object({
  setId: z.uuid().optional(),
  title: requiredText(200, "Enter a title."),
  description: optionalText(2000),
  cefrLevel: cefr,
  topic: optionalText(100),
})
export const setWordsSchema = z.object({ setId: z.uuid(), wordIds: z.array(z.uuid()).max(200) })
export const setStatusSchema = z.object({ setId: z.uuid(), status: z.enum(["draft", "published", "archived"]) })

export const practiceSchema = z.object({
  setId: z.uuid(),
  activity: z.enum(ACTIVITIES),
  results: z.array(z.object({ wordId: z.uuid(), correct: z.boolean() })).min(1).max(200),
})

// --- Lessons ---------------------------------------------------------------

export const lessonSchema = z
  .object({
    lessonId: z.uuid().optional(),
    skill: z.enum(LESSON_SKILLS as [string, ...string[]]),
    title: requiredText(200, "Enter a title."),
    cefrLevel: cefr,
    topic: optionalText(100),
    summary: optionalText(1000),
    body: optionalText(20000),
    form: optionalText(5000),
    usage: optionalText(5000),
    examples: lines,
    mistakes: z
      .array(z.object({ incorrect: z.string().trim().max(500), correct: z.string().trim().max(500), note: z.string().trim().max(500) }))
      .max(30)
      .transform((items) => items.filter((m) => m.incorrect || m.correct)),
    responseMode: z.union([z.enum(["text", "audio", "video", "audio_or_video"]), z.literal("")]),
    minWords: optionalInt(1, 5000, "Minimum words"),
    maxWords: optionalInt(1, 5000, "Maximum words"),
    rubric: z
      .array(z.object({ criterion: z.string().trim().max(100), description: z.string().trim().max(500), maxPoints: z.string() }))
      .max(10)
      .transform((items) => items.filter((r) => r.criterion)),
    maxScore: positive("Maximum score", 1000),
    transcript: optionalText(20000),
    modelAnswer: optionalText(20000),
    wordIds: z.array(z.uuid()).max(100),
  })
  .superRefine((v, ctx) => {
    if (isWorkSkill(v.skill as never) && !v.responseMode) {
      ctx.addIssue({ code: "custom", message: "Choose how students answer.", path: ["responseMode"] })
    }
    if (v.minWords && v.maxWords && v.minWords > v.maxWords) {
      ctx.addIssue({ code: "custom", message: "The maximum must be at least the minimum.", path: ["maxWords"] })
    }
    if (v.mistakes.some((m) => !m.incorrect || !m.correct)) {
      ctx.addIssue({ code: "custom", message: "Give both the wrong and the right version of each mistake.", path: ["mistakes"] })
    }
    v.rubric.forEach((r, i) => {
      const n = Number(r.maxPoints.replace(",", "."))
      if (!(n > 0 && n <= 100)) ctx.addIssue({ code: "custom", message: `Criterion ${i + 1} needs points between 0 and 100.`, path: ["rubric"] })
    })
  })

export type LessonFormInput = z.input<typeof lessonSchema>
export type LessonFormOutput = z.output<typeof lessonSchema>

export const lessonStatusSchema = z.object({ lessonId: z.uuid(), status: z.enum(["draft", "published", "archived"]) })
export const lessonMediaSchema = z.object({ lessonId: z.uuid(), ...upload })
export const lessonIdSchema = z.object({ lessonId: z.uuid() })
export const lessonQuestionsSchema = z.object({ lessonId: z.uuid(), questionIds: z.array(z.uuid()).min(1).max(50) })
export const lessonQuestionIdSchema = z.object({ lessonQuestionId: z.uuid() })

export const lessonPracticeSchema = z.object({
  lessonId: z.uuid(),
  responses: z.record(z.uuid(), responseSchema),
})

export const lessonWorkSchema = z.object({
  lessonId: z.uuid(),
  text: optionalText(20000),
  file: z.object(upload).nullable(),
})

export const reviewSchema = z.object({
  submissionId: z.uuid(),
  feedback: requiredText(5000, "Write some feedback for the student."),
  rubricScores: z.array(z.number().min(0).max(100)).max(10).nullable(),
  score: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(",", "."))
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter a score with at most 2 decimals.")
    .transform((v) => (v === "" ? null : Number(v))),
})
