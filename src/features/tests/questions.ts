import type { Enums, Json } from "@/types/database"

export type QuestionType = Enums<"question_type">
export type CefrLevel = Enums<"cefr_level">
export type Difficulty = Enums<"question_difficulty">
export type TestStatus = Enums<"test_status">
export type ReviewPolicy = Enums<"test_review_policy">
export type AttemptStatus = Enums<"test_attempt_status">

export const QUESTION_TYPES = [
  "multiple_choice",
  "multiple_response",
  "true_false",
  "matching",
  "fill_blank",
  "short_answer",
  "essay",
  "listening",
  "speaking",
  "sentence_transformation",
  "error_correction",
] as const satisfies readonly QuestionType[]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  multiple_response: "Multiple response",
  true_false: "True / false",
  matching: "Matching",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  essay: "Essay",
  listening: "Listening",
  speaking: "Speaking",
  sentence_transformation: "Sentence transformation",
  error_correction: "Error correction",
}

export const CEFR_LEVELS = ["pre_a1", "a1", "a2", "b1", "b2", "c1", "c2"] as const satisfies readonly CefrLevel[]
export const CEFR_LABELS: Record<CefrLevel, string> = {
  pre_a1: "Pre-A1",
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
}

export const DIFFICULTIES = ["easy", "medium", "hard"] as const satisfies readonly Difficulty[]
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" }

export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  archived: "Archived",
}

export const REVIEW_POLICIES = ["after_last_attempt", "after_close", "never"] as const satisfies readonly ReviewPolicy[]
export const REVIEW_POLICY_LABELS: Record<ReviewPolicy, string> = {
  after_last_attempt: "After the student's last attempt",
  after_close: "After the test closes",
  never: "Never",
}

// ---------------------------------------------------------------------------
// Content / key / response shapes (mirrors the database; it re-validates)
// ---------------------------------------------------------------------------

export type QuestionContent = {
  options?: string[]
  left?: string[]
  right?: string[]
  blank_count?: number
  source_text?: string
  format?: "choice" | "text"
  min_words?: number
  max_words?: number
  max_seconds?: number
}

export type AnswerKey = {
  correct?: number | number[] | boolean
  pairs?: number[]
  blanks?: string[][]
  case_sensitive?: boolean
  accepted?: string[]
}

export type SpokenFile = { path: string; name: string; mime: string; size: number }

export type Response = {
  choice?: number
  choices?: number[]
  value?: boolean
  pairs?: number[]
  blanks?: string[]
  text?: string
  file?: SpokenFile
}

export const asContent = (value: Json | null | undefined) => (value ?? {}) as QuestionContent
export const asKey = (value: Json | null | undefined) => (value ?? {}) as AnswerKey
export const asResponse = (value: Json | null | undefined) => (value ?? {}) as Response

/** Questions answered by picking options (their options can be shuffled). */
export function isChoice(type: QuestionType, content: QuestionContent) {
  return type === "multiple_choice" || type === "multiple_response" || (type === "listening" && content.format === "choice")
}

/** Graded entirely by the database; everything else may need a teacher. */
export function isAutoGraded(type: QuestionType, content: QuestionContent) {
  return (
    ["multiple_choice", "multiple_response", "true_false", "matching", "fill_blank"].includes(type) ||
    (type === "listening" && content.format === "choice")
  )
}

/** Short text answers are marked automatically when they match a listed answer. */
export function isSometimesAuto(type: QuestionType) {
  return type === "short_answer" || type === "sentence_transformation" || type === "error_correction"
}

export function gradingLabel(type: QuestionType, content: QuestionContent) {
  if (isAutoGraded(type, content)) return "Marked automatically"
  if (isSometimesAuto(type)) return "Automatic when it matches a listed answer, otherwise by the teacher"
  return "Marked by the teacher"
}

/** The prompt of a fill-in question split around its ___ blanks. */
export function splitBlanks(prompt: string) {
  return prompt.split("___")
}

export function isAnswered(response: Response | null | undefined) {
  if (!response) return false
  if (response.choice !== undefined || response.value !== undefined || response.file) return true
  if (response.choices?.length) return true
  if (response.pairs?.some((p) => p >= 0)) return true
  if (response.blanks?.some((b) => b.trim() !== "")) return true
  return (response.text ?? "").trim() !== ""
}

/** A response as text for review screens. */
export function describeResponse(type: QuestionType, content: QuestionContent, response: Response | null | undefined): string | null {
  if (!isAnswered(response) || !response) return null
  const options = content.options ?? []
  switch (type) {
    case "multiple_choice":
    case "listening":
      return response.choice !== undefined ? options[response.choice] ?? "?" : response.text ?? null
    case "multiple_response":
      return (response.choices ?? []).map((i) => options[i] ?? "?").join(", ")
    case "true_false":
      return response.value ? "True" : "False"
    case "matching":
      return (content.left ?? [])
        .map((left, i) => `${left} → ${(response.pairs?.[i] ?? -1) >= 0 ? content.right?.[response.pairs![i]] : "—"}`)
        .join("; ")
    case "fill_blank":
      return (response.blanks ?? []).map((b) => b || "—").join(" | ")
    case "speaking":
      return response.file ? `Recording: ${response.file.name}` : null
    default:
      return response.text ?? null
  }
}

/** The correct answer as text (only ever given the key when the database allows it). */
export function describeKey(type: QuestionType, content: QuestionContent, key: AnswerKey | null | undefined): string | null {
  if (!key) return null
  const options = content.options ?? []
  switch (type) {
    case "multiple_choice":
    case "listening":
      return typeof key.correct === "number" ? options[key.correct] ?? null : null
    case "multiple_response":
      return Array.isArray(key.correct) ? key.correct.map((i) => options[i]).join(", ") : null
    case "true_false":
      return typeof key.correct === "boolean" ? (key.correct ? "True" : "False") : null
    case "matching":
      return (content.left ?? []).map((left, i) => `${left} → ${content.right?.[key.pairs?.[i] ?? -1] ?? "?"}`).join("; ")
    case "fill_blank":
      return (key.blanks ?? []).map((alternatives) => alternatives.join(" / ")).join(" | ")
    case "short_answer":
    case "sentence_transformation":
    case "error_correction":
      return key.accepted?.length ? key.accepted.join(" / ") : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Building a question from the editor
// ---------------------------------------------------------------------------

/** Shuffles the right-hand column so its order never gives the answer away. */
export function prepareMatching(pairs: { left: string; right: string }[], random: () => number = Math.random) {
  const order = pairs.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const right = order.map((i) => pairs[i].right)
  // key: for each left item, the position of its answer in the shuffled column
  const key = pairs.map((_, i) => order.indexOf(i))
  return { left: pairs.map((p) => p.left), right, key }
}

/** The display order of a question's options in one attempt (identity if not shuffled). */
export function optionOrder(optionOrders: Json, questionId: string, count: number): number[] {
  const orders = (optionOrders ?? {}) as Record<string, number[]>
  const order = orders[questionId]
  return Array.isArray(order) && order.length === count ? order : Array.from({ length: count }, (_, i) => i)
}

// ---------------------------------------------------------------------------
// Results analytics
// ---------------------------------------------------------------------------

type ScoredAttempt = { student_id: string; attempt_number: number; status: AttemptStatus; score: number | null }

export function summarizeScores(scores: number[]) {
  if (scores.length === 0) return { count: 0, average: null, median: null, highest: null, lowest: null }
  const sorted = [...scores].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    count: scores.length,
    average: round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
    median: round(median),
    highest: sorted[sorted.length - 1],
    lowest: sorted[0],
  }
}

/** Each student's best fully graded attempt. */
export function bestAttempts<T extends ScoredAttempt>(attempts: T[]) {
  const best = new Map<string, T>()
  for (const attempt of attempts) {
    if (attempt.status !== "graded" || attempt.score === null) continue
    const current = best.get(attempt.student_id)
    if (!current || Number(attempt.score) > Number(current.score)) best.set(attempt.student_id, attempt)
  }
  return [...best.values()]
}

/** Scores grouped into ten bands of the total (0–10%, …, 90–100%). */
export function scoreDistribution(scores: number[], total: number) {
  const bands = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}%`,
    from: i * 10,
    students: 0,
  }))
  for (const score of scores) {
    const percent = total > 0 ? (score / total) * 100 : 0
    bands[Math.min(9, Math.max(0, Math.floor(percent / 10)))].students += 1
  }
  return bands
}
