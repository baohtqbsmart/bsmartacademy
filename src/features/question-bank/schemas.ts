import { z } from "zod"

import { ASSIGNMENT_SKILLS } from "@/features/assignments/status"
import { CEFR_LEVELS, DIFFICULTIES, prepareMatching, QUESTION_TYPES, type AnswerKey, type QuestionContent } from "@/features/tests/questions"
import { optionalText, requiredText } from "@/lib/validation"

/** Editor state for every question type (unused fields are ignored per type). */
export type QuestionFormValues = {
  questionId?: string
  subjectId: string
  questionType: (typeof QUESTION_TYPES)[number]
  skill: string
  cefrLevel: string
  topic: string
  difficulty: (typeof DIFFICULTIES)[number]
  points: string
  tags: string
  prompt: string
  options: string[]
  correct: number[]
  trueFalse: "" | "true" | "false"
  pairs: { left: string; right: string }[]
  blanks: string[]
  caseSensitive: boolean
  accepted: string
  sourceText: string
  listeningFormat: "choice" | "text"
  minWords: string
  maxWords: string
  maxSeconds: string
  explanation: string
  /** Kept when editing (media is uploaded separately). */
  mediaPath: string | null
}

const lines = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
const alternatives = (value: string) =>
  value
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean)
const optionalCount = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max), `${label} must be between 1 and ${max}.`)
    .transform((v) => (v === "" ? undefined : Number(v)))

const base = z.object({
  questionId: z.uuid().optional(),
  subjectId: z.uuid("Choose a subject."),
  questionType: z.enum(QUESTION_TYPES),
  skill: z.union([z.enum(ASSIGNMENT_SKILLS), z.literal("")]),
  cefrLevel: z.union([z.enum(CEFR_LEVELS), z.literal("")]),
  topic: optionalText(100),
  difficulty: z.enum(DIFFICULTIES),
  points: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100, "Points must be between 0 and 100.")
    .transform(Number),
  tags: z.string().max(1000),
  prompt: requiredText(5000, "Write the question."),
  options: z.array(z.string().trim().max(500)),
  correct: z.array(z.number().int().min(0).max(7)),
  trueFalse: z.enum(["", "true", "false"]),
  pairs: z.array(z.object({ left: z.string().trim().max(500), right: z.string().trim().max(500) })),
  blanks: z.array(z.string().max(1000)),
  caseSensitive: z.boolean(),
  accepted: z.string().max(5000),
  sourceText: z.string().trim().max(2000),
  listeningFormat: z.enum(["choice", "text"]),
  minWords: optionalCount("Minimum words", 5000),
  maxWords: optionalCount("Maximum words", 5000),
  maxSeconds: optionalCount("Maximum length", 600),
  explanation: optionalText(5000),
  mediaPath: z.string().max(300).nullable(),
})

type Issue = { path: string; message: string }

/**
 * Turns the editor into the stored question (public content) and its key
 * (never sent to students). The database re-checks both.
 */
export const questionFormSchema = base.transform((v, ctx) => {
  const issues: Issue[] = []
  const content: QuestionContent = {}
  const key: AnswerKey = {}
  const options = v.options.filter(Boolean)
  const choice = v.questionType === "multiple_choice" || v.questionType === "multiple_response" || (v.questionType === "listening" && v.listeningFormat === "choice")

  if (choice) {
    if (options.length < 2 || options.length > 8) issues.push({ path: "options", message: "Give between 2 and 8 options." })
    const correct = v.correct.filter((i) => i < options.length)
    content.options = options
    if (v.questionType === "multiple_response") {
      if (correct.length === 0) issues.push({ path: "correct", message: "Mark at least one correct option." })
      key.correct = [...new Set(correct)].sort()
    } else {
      if (correct.length !== 1) issues.push({ path: "correct", message: "Mark the correct option." })
      key.correct = correct[0]
    }
  }

  switch (v.questionType) {
    case "listening":
      content.format = v.listeningFormat
      break
    case "true_false":
      if (!v.trueFalse) issues.push({ path: "trueFalse", message: "Choose true or false." })
      key.correct = v.trueFalse === "true"
      break
    case "matching": {
      const pairs = v.pairs.filter((p) => p.left || p.right)
      if (pairs.length < 2 || pairs.length > 10 || pairs.some((p) => !p.left || !p.right)) {
        issues.push({ path: "pairs", message: "Give 2 to 10 complete pairs." })
      }
      const prepared = prepareMatching(pairs)
      content.left = prepared.left
      content.right = prepared.right
      key.pairs = prepared.key
      break
    }
    case "fill_blank": {
      const count = v.prompt.split("___").length - 1
      if (count < 1) issues.push({ path: "prompt", message: "Mark each blank in the question with ___ (three underscores)." })
      const blanks = Array.from({ length: count }, (_, i) => alternatives(v.blanks[i] ?? ""))
      if (blanks.some((b) => b.length === 0)) issues.push({ path: "blanks", message: "Give an answer for every blank." })
      key.blanks = blanks
      key.case_sensitive = v.caseSensitive
      break
    }
    case "sentence_transformation":
    case "error_correction":
      if (!v.sourceText) issues.push({ path: "sourceText", message: "Give the sentence the student works on." })
      content.source_text = v.sourceText
      key.accepted = lines(v.accepted)
      break
    case "short_answer":
      key.accepted = lines(v.accepted)
      break
    case "essay":
      if (v.minWords && v.maxWords && v.minWords > v.maxWords) issues.push({ path: "maxWords", message: "The maximum must be at least the minimum." })
      if (v.minWords) content.min_words = v.minWords
      if (v.maxWords) content.max_words = v.maxWords
      break
    case "speaking":
      if (v.maxSeconds) content.max_seconds = v.maxSeconds
      break
  }

  for (const issue of issues) ctx.addIssue({ code: "custom", message: issue.message, path: [issue.path] })
  if (issues.length) return z.NEVER

  return {
    questionId: v.questionId,
    explanation: v.explanation,
    answer: key,
    fields: {
      subject_id: v.subjectId,
      question_type: v.questionType,
      skill: v.skill || null,
      cefr_level: v.cefrLevel || null,
      topic: v.topic,
      difficulty: v.difficulty,
      points: v.points,
      prompt: v.prompt,
      content,
      media_path: v.mediaPath,
      tags: v.tags.split(/[,\n]/).map((t) => t.trim()).filter(Boolean),
    },
  }
})

export type QuestionPayload = z.output<typeof questionFormSchema>

export const questionIdSchema = z.object({ questionId: z.uuid() })
export const questionMediaSchema = z.object({ questionId: z.uuid(), objectPath: z.string().min(1).max(300), fileName: z.string().min(1).max(255) })
