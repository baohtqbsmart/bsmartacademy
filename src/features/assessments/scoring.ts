import type { Enums } from "@/types/database"

export type AssessmentKind = Enums<"assessment_kind">
export type Scoring = Enums<"assessment_scoring">
export type ResponseMode = Enums<"assessment_response">
export type AnnotationCategory = Enums<"annotation_category">
export type FeedbackSource = Enums<"feedback_source">
export type Criterion = { name: string; description?: string; max_points: number }

export const KIND_LABELS: Record<AssessmentKind, string> = { writing: "Writing", speaking: "Speaking" }

export const SCORING_LABELS: Record<Scoring, string> = {
  points: "Points per criterion",
  ielts_band: "IELTS-style bands (0–9)",
}

export const RESPONSE_LABELS: Record<ResponseMode, string> = {
  online_text: "Write online",
  document: "Upload a document",
  online_or_document: "Write online or upload a document",
  audio: "Audio recording",
  video: "Video recording",
  audio_or_video: "Audio or video recording",
}

export const WRITING_RESPONSES = ["online_text", "document", "online_or_document"] as const
export const SPEAKING_RESPONSES = ["audio", "video", "audio_or_video"] as const

export const CATEGORIES = [
  "grammar",
  "vocabulary",
  "spelling",
  "punctuation",
  "organization",
  "content",
  "pronunciation",
  "fluency",
  "interaction",
  "other",
] as const satisfies readonly AnnotationCategory[]

export const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  spelling: "Spelling",
  punctuation: "Punctuation",
  organization: "Organization",
  content: "Content",
  pronunciation: "Pronunciation",
  fluency: "Fluency",
  interaction: "Interaction",
  other: "Other",
}

export const WRITING_CATEGORIES: AnnotationCategory[] = ["grammar", "vocabulary", "spelling", "punctuation", "organization", "content", "other"]
export const SPEAKING_CATEGORIES: AnnotationCategory[] = ["pronunciation", "fluency", "grammar", "vocabulary", "interaction", "content", "other"]

// ---------------------------------------------------------------------------
// AI-assisted feedback (not implemented yet). Anything not written by a
// teacher must carry this label and must never be shown as a score.
// ---------------------------------------------------------------------------

export const AI_FEEDBACK_LABEL = "AI-assisted feedback"
export const AI_FEEDBACK_NOTICE =
  "Generated with AI assistance to support learning. It is not an official examination score and does not replace your teacher's assessment."
export const IELTS_NOTICE = "IELTS-style practice marking by your teacher. This is not an official IELTS score."

export const isOfficial = (source: FeedbackSource) => source === "teacher"

// ---------------------------------------------------------------------------
// Scores (mirror grade_assessment(); the database is authoritative)
// ---------------------------------------------------------------------------

/** IELTS-style overall band: the average rounded to the nearest half band, halves rounded up (6.25 → 6.5, 6.75 → 7). */
export function ieltsBand(scores: number[]) {
  if (scores.length === 0) return 0
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length
  return Math.floor(average * 2 + 0.5) / 2
}

export function totalScore(scoring: Scoring, scores: number[]) {
  return scoring === "ielts_band" ? ieltsBand(scores) : Math.round(scores.reduce((sum, s) => sum + s, 0) * 100) / 100
}

export function maxScore(scoring: Scoring, criteria: Criterion[]) {
  return scoring === "ielts_band" ? 9 : criteria.reduce((sum, c) => sum + c.max_points, 0)
}

/** A score that the database will accept for this criterion. */
export function validScore(scoring: Scoring, criterion: Criterion, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > criterion.max_points) return false
  return scoring === "ielts_band" ? Number.isInteger(value) : Number.isInteger(value * 2)
}

/** Same rule as the database: words are runs of non-space characters. */
export function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export type Highlight = { id: string; start: number; end: number }

/** The text cut into plain and highlighted pieces (highlights never overlap). */
export function segments<T extends Highlight>(text: string, highlights: T[]) {
  const sorted = [...highlights].filter((h) => h.start >= 0 && h.end <= text.length && h.end > h.start).sort((a, b) => a.start - b.start)
  const parts: { text: string; highlight: T | null; start: number }[] = []
  let at = 0
  for (const h of sorted) {
    if (h.start < at) continue
    if (h.start > at) parts.push({ text: text.slice(at, h.start), highlight: null, start: at })
    parts.push({ text: text.slice(h.start, h.end), highlight: h, start: h.start })
    at = h.end
  }
  if (at < text.length) parts.push({ text: text.slice(at), highlight: null, start: at })
  return parts
}

/** "m:ss" for time-stamped comments. */
export function formatSeconds(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Average share (0–1) per criterion name across returned grades. */
export function criterionAverages(grades: { criteria: Criterion[]; scores: number[] }[]) {
  const totals = new Map<string, { sum: number; n: number }>()
  for (const g of grades) {
    g.criteria.forEach((c, i) => {
      const score = g.scores[i]
      if (score === undefined) return
      const entry = totals.get(c.name) ?? { sum: 0, n: 0 }
      entry.sum += score / c.max_points
      entry.n += 1
      totals.set(c.name, entry)
    })
  }
  return [...totals.entries()].map(([name, { sum, n }]) => ({ name, average: sum / n, count: n })).sort((a, b) => a.average - b.average)
}
