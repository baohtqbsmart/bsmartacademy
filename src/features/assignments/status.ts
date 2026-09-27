import type { Enums } from "@/types/database"

export type AssignmentStatus = Enums<"assignment_status">
export type AssignmentType = Enums<"assignment_type">
export type AssignmentSkill = Enums<"assignment_skill">
export type QuestionKind = Enums<"question_kind">
export type SubmissionStatus = Enums<"submission_status">

export const ASSIGNMENT_TYPES = [
  "homework",
  "worksheet",
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "writing",
  "project",
  "quiz",
  "test",
] as const satisfies readonly AssignmentType[]

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  homework: "Homework",
  worksheet: "Worksheet",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  project: "Project",
  quiz: "Quiz",
  test: "Test",
}

export const ASSIGNMENT_SKILLS = [
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "writing",
  "pronunciation",
  "problem_solving",
  "mixed",
] as const satisfies readonly AssignmentSkill[]

export const SKILL_LABELS: Record<AssignmentSkill, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  pronunciation: "Pronunciation",
  problem_solving: "Problem solving",
  mixed: "Mixed skills",
}

export const QUESTION_KINDS = ["multiple_choice", "short_answer", "long_answer"] as const satisfies readonly QuestionKind[]

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
  long_answer: "Long answer",
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  closed: "Closed",
  archived: "Archived",
}

/** A scheduled assignment whose publication time has passed is published (mirrors the database). */
export function effectiveStatus(status: AssignmentStatus, publishAt: string | null, now: Date = new Date()): AssignmentStatus {
  return status === "scheduled" && publishAt !== null && new Date(publishAt) <= now ? "published" : status
}

export type LifecycleAction = "publish" | "schedule" | "unschedule" | "close" | "reopen" | "archive" | "restore"

export const LIFECYCLE_TARGET: Record<LifecycleAction, AssignmentStatus | "restore"> = {
  publish: "published",
  schedule: "scheduled",
  unschedule: "draft",
  close: "closed",
  reopen: "published",
  archive: "archived",
  restore: "restore",
}

/** The moves the database allows from each state (see prepare_assignment()). */
export function availableActions(state: AssignmentStatus): LifecycleAction[] {
  switch (state) {
    case "draft":
      return ["publish", "schedule", "archive"]
    case "scheduled":
      return ["publish", "schedule", "unschedule", "archive"]
    case "published":
      return ["close", "archive"]
    case "closed":
      return ["reopen", "archive"]
    case "archived":
      return ["restore"]
  }
}

/** Restoring an archived assignment: back to closed if students ever saw it, else to draft. */
export function restoreTarget(publishedAt: string | null): AssignmentStatus {
  return publishedAt ? "closed" : "draft"
}

// ---------------------------------------------------------------------------
// A student's work on an assignment
// ---------------------------------------------------------------------------

export type WorkStatus = "not_started" | "missing" | "in_progress" | "submitted" | "late" | "graded" | "returned"

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  not_started: "To do",
  missing: "Missing",
  in_progress: "In progress",
  submitted: "Submitted",
  late: "Submitted late",
  graded: "Graded",
  returned: "Returned",
}

/**
 * What to show for a student's latest attempt. Students and parents never see
 * "graded": until the grade is returned the work is simply submitted.
 */
export function workStatus(
  latest: { status: SubmissionStatus; is_late: boolean } | null,
  dueAt: string | null,
  viewer: "staff" | "family",
  now: Date = new Date()
): WorkStatus {
  if (!latest) return dueAt && new Date(dueAt) < now ? "missing" : "not_started"
  switch (latest.status) {
    case "in_progress":
      return "in_progress"
    case "returned":
      return "returned"
    case "graded":
      if (viewer === "staff") return "graded"
      return latest.is_late ? "late" : "submitted"
    case "submitted":
      return latest.is_late ? "late" : "submitted"
  }
}

/** "9.5 / 10" without trailing zeros. */
export function formatScore(score: number | string, max: number | string) {
  const trim = (n: number | string) => String(Number(n))
  return `${trim(score)} / ${trim(max)}`
}
