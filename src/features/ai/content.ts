import { z } from "zod"

/**
 * The structured lesson plan the AI must return and the teacher edits. The
 * same schema validates the AI's output, every teacher edit and every save.
 */

export const AI_TASKS = ["lesson", "worksheet", "vocabulary", "grammar", "reading", "listening", "speaking", "writing", "differentiated", "homework"] as const
export type AiTask = (typeof AI_TASKS)[number]

export const TASK_LABELS: Record<AiTask, string> = {
  lesson: "Full lesson",
  worksheet: "Worksheet",
  vocabulary: "Vocabulary set",
  grammar: "Grammar exercises",
  reading: "Reading text and questions",
  listening: "Listening script and questions",
  speaking: "Speaking prompts",
  writing: "Writing prompt",
  differentiated: "Differentiated activities",
  homework: "Homework",
}

export const CEFR_LEVELS = ["pre_a1", "a1", "a2", "b1", "b2", "c1", "c2"] as const
export const CEFR_NAMES: Record<(typeof CEFR_LEVELS)[number], string> = { pre_a1: "Pre-A1", a1: "A1", a2: "A2", b1: "B1", b2: "B2", c1: "C1", c2: "C2" }
export const AI_SKILLS = ["mixed", "listening", "reading", "speaking", "writing", "grammar", "vocabulary", "pronunciation"] as const
export const SKILL_NAMES: Record<(typeof AI_SKILLS)[number], string> = {
  mixed: "Mixed skills",
  listening: "Listening",
  reading: "Reading",
  speaking: "Speaking",
  writing: "Writing",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
}

const trimmed = (max: number) => z.string().trim().min(1, "Must not be empty.").max(max)

export const generationInputSchema = z.object({
  task: z.enum(AI_TASKS),
  topic: trimmed(200),
  cefr: z.enum(CEFR_LEVELS),
  studentAge: z.coerce.number().int().min(4, "Age 4 or older.").max(80),
  skill: z.enum(AI_SKILLS),
  objective: trimmed(500),
  durationMinutes: z.coerce.number().int().min(10, "At least 10 minutes.").max(180, "At most 180 minutes."),
  notes: z.string().trim().max(1000).default(""),
})
export type GenerationInput = z.output<typeof generationInputSchema>

// ---------------------------------------------------------------------------
// Lesson plan
// ---------------------------------------------------------------------------

const lines = (maxItems: number, maxLength: number) => z.array(trimmed(maxLength)).max(maxItems)

export const stageSchema = z.object({
  minutes: z.int().min(1).max(180),
  steps: lines(10, 600).min(1, "Add at least one step."),
  materials: lines(10, 200).default([]),
  teacherNotes: z.string().trim().max(1000).default(""),
})

export const EXERCISE_TYPES = ["multiple_choice", "true_false", "gap_fill", "short_answer", "matching"] as const
export const EXERCISE_LABELS: Record<(typeof EXERCISE_TYPES)[number], string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  gap_fill: "Gap fill",
  short_answer: "Short answer",
  matching: "Matching",
}

export const exerciseSchema = z
  .object({
    type: z.enum(EXERCISE_TYPES),
    prompt: trimmed(600),
    options: lines(8, 200).default([]),
    answer: trimmed(300),
    explanation: z.string().trim().max(600).default(""),
  })
  .superRefine((e, ctx) => {
    if (e.type === "multiple_choice") {
      if (e.options.length < 2) ctx.addIssue({ code: "custom", message: "A multiple-choice question needs at least two options.", path: ["options"] })
      else if (!e.options.includes(e.answer)) ctx.addIssue({ code: "custom", message: "The answer must be one of the options.", path: ["answer"] })
    }
    if (e.type === "true_false" && !/^(true|false)$/i.test(e.answer)) ctx.addIssue({ code: "custom", message: "The answer must be True or False.", path: ["answer"] })
    if (e.type === "gap_fill" && !/_{2,}|\(\s*\)|\[\s*\]/.test(e.prompt)) ctx.addIssue({ code: "custom", message: "Mark the gap with ___.", path: ["prompt"] })
    if (e.type === "matching" && e.options.length < 2) ctx.addIssue({ code: "custom", message: "List the items to match as options.", path: ["options"] })
  })

export const vocabularySchema = z.object({
  word: trimmed(60),
  partOfSpeech: trimmed(30),
  meaning: trimmed(200),
  example: trimmed(300),
  vietnamese: z.string().trim().max(120).default(""),
})

export const lessonPlanSchema = z.object({
  title: trimmed(200),
  summary: trimmed(1000),
  objectives: lines(6, 300).min(1, "Add at least one objective."),
  warmUp: stageSchema,
  presentation: stageSchema,
  practice: stageSchema,
  production: stageSchema,
  homework: z.object({ instructions: trimmed(1000), tasks: lines(8, 500).min(1, "Add at least one homework task.") }),
  vocabulary: z.array(vocabularySchema).max(30).default([]),
  exercises: z.array(exerciseSchema).max(30).default([]),
  readingText: z.string().trim().max(6000).default(""),
  listeningScript: z.string().trim().max(6000).default(""),
  speakingPrompts: lines(12, 500).default([]),
  writingPrompt: z
    .object({ task: trimmed(1000), minWords: z.int().min(10).max(1000), maxWords: z.int().min(10).max(1500), criteria: lines(8, 200).min(1) })
    .refine((w) => w.maxWords >= w.minWords, { message: "The maximum must not be below the minimum.", path: ["maxWords"] })
    .nullable()
    .default(null),
  differentiation: z.object({ support: lines(6, 500).min(1), core: lines(6, 500).min(1), challenge: lines(6, 500).min(1) }).nullable().default(null),
})

export type LessonPlan = z.output<typeof lessonPlanSchema>
export const STAGES = ["warmUp", "presentation", "practice", "production"] as const
export const STAGE_NAMES: Record<(typeof STAGES)[number], string> = { warmUp: "Warm-up", presentation: "Presentation", practice: "Practice", production: "Production" }

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/**
 * Checks beyond the shape: what each kind of request must contain and whether
 * the timing fits the lesson. Returns human-readable problems (empty = fine).
 */
export function planProblems(task: AiTask, plan: LessonPlan, durationMinutes: number): string[] {
  const problems: string[] = []
  const total = STAGES.reduce((sum, s) => sum + plan[s].minutes, 0)
  if (total > durationMinutes * 1.1 + 1) problems.push(`The stages take ${total} minutes, more than the ${durationMinutes}-minute lesson.`)
  if (total < durationMinutes * 0.6) problems.push(`The stages take only ${total} of the ${durationMinutes} minutes.`)
  const need = (ok: boolean, message: string) => !ok && problems.push(message)
  switch (task) {
    case "worksheet":
      need(plan.exercises.length >= 8, "A worksheet needs at least 8 exercises with answers.")
      break
    case "vocabulary":
      need(plan.vocabulary.length >= 6, "A vocabulary set needs at least 6 words.")
      break
    case "grammar":
      need(plan.exercises.length >= 6, "Grammar practice needs at least 6 exercises with answers.")
      break
    case "reading":
      need(words(plan.readingText) >= 80, "The reading text needs at least 80 words.")
      need(plan.exercises.length >= 4, "Add at least 4 reading questions with answers.")
      break
    case "listening":
      need(words(plan.listeningScript) >= 60, "The listening script needs at least 60 words.")
      need(plan.exercises.length >= 4, "Add at least 4 listening questions with answers.")
      break
    case "speaking":
      need(plan.speakingPrompts.length >= 3, "Add at least 3 speaking prompts.")
      break
    case "writing":
      need(plan.writingPrompt !== null, "Add the writing task with word limits and criteria.")
      break
    case "differentiated":
      need(plan.differentiation !== null, "Add support, core and challenge activities.")
      break
    case "homework":
      need(plan.homework.tasks.length >= 2, "Homework needs at least 2 tasks.")
      break
    case "lesson":
      break
  }
  return problems
}

/** Zod issues as short sentences with their location ("Practice → steps: Must not be empty."). */
export function describeIssues(error: z.ZodError) {
  return error.issues.slice(0, 8).map((i) => `${i.path.join(" → ") || "plan"}: ${i.message}`)
}
