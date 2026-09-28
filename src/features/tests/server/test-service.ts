import "server-only"

import type { z } from "zod"

import type { TestFormOutput, testLifecycleSchema } from "@/features/tests/schemas"
import type { TestStatus } from "@/features/tests/questions"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"

// Every query runs as the signed-in user. RLS: editors see every state;
// students/parents see published and closed tests of their (children's)
// classes, and a test's questions only once an attempt has started. Answer
// keys never reach students through these queries.

export async function listTests(db: DbClient, filters: { q?: string; classId?: string; status?: TestStatus | "current" } = {}) {
  let query = db
    .from("tests")
    .select(
      `id, title, status, class_id, available_from, available_until, time_limit_minutes, max_attempts, total_score, review_policy, created_at,
       class:classes(id, name), test_questions(count), test_attempts(student_id, attempt_number, status, score)`
    )
    .order("created_at", { ascending: false })
  if (filters.classId) query = query.eq("class_id", filters.classId)
  const status = filters.status ?? "current"
  query = status === "current" ? query.neq("status", "archived") : query.eq("status", status)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const term = normalizeSearch(filters.q ?? "")
  return data.filter((t) => !term || normalizeSearch(`${t.title} ${t.class?.name ?? ""}`).includes(term))
}

export type TestListItem = Awaited<ReturnType<typeof listTests>>[number]

export async function getTest(db: DbClient, testId: string) {
  const { data, error } = await db
    .from("tests")
    .select(
      `id, class_id, title, description, instructions, status, available_from, available_until, time_limit_minutes, max_attempts,
       shuffle_questions, shuffle_options, total_score, review_policy, published_at, closed_at, archived_at, created_by_name, unit_id,
       class:classes(id, name, status, course:courses(id, name))`
    )
    .eq("id", testId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export type TestDetail = NonNullable<Awaited<ReturnType<typeof getTest>>>

/** A test's questions (RLS: editors, or students/parents after an attempt started). */
export async function listTestQuestions(db: DbClient, testId: string) {
  const { data, error } = await db
    .from("test_questions")
    .select("id, position, source_question_id, source_version, question_type, prompt, content, media_path, points")
    .eq("test_id", testId)
    .order("position")
  if (error) throw fromPostgrestError(error)
  return Promise.all(data.map(async (q) => ({ ...q, mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, q.media_path) })))
}

export type TestQuestion = Awaited<ReturnType<typeof listTestQuestions>>[number]

/** Keys of a test's questions (RLS: the test's editors only). */
export async function listTestKeys(db: DbClient, questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, { answer: unknown; explanation: string | null }>()
  const { data, error } = await db.from("test_question_keys").select("test_question_id, answer, explanation").in("test_question_id", questionIds)
  if (error) throw fromPostgrestError(error)
  return new Map(data.map((k) => [k.test_question_id, k]))
}

export async function listTestClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, name")
    .is("deleted_at", null)
    .in("status", ["planned", "active"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

function toRow(input: TestFormOutput) {
  return {
    class_id: input.classId,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    available_from: input.availableFrom,
    available_until: input.availableUntil,
    time_limit_minutes: input.timeLimitMinutes,
    max_attempts: input.maxAttempts,
    shuffle_questions: input.shuffleQuestions,
    shuffle_options: input.shuffleOptions,
    total_score: input.totalScore,
    review_policy: input.reviewPolicy,
  }
}

export async function createTest(db: DbClient, input: TestFormOutput) {
  const { data, error } = await db.from("tests").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateTest(db: DbClient, testId: string, input: TestFormOutput) {
  const { data, error } = await db.from("tests").update(toRow(input)).eq("id", testId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Test not found.")
}

export async function changeTestStatus(db: DbClient, input: z.output<typeof testLifecycleSchema>) {
  let status: TestStatus
  if (input.action === "restore") {
    const { data, error } = await db.from("tests").select("published_at").eq("id", input.testId).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw new AppError("NOT_FOUND", "Test not found.")
    status = data.published_at ? "closed" : "draft"
  } else {
    status = ({ publish: "published", reopen: "published", close: "closed", archive: "archived" } as const)[input.action]
  }
  const { data, error } = await db.from("tests").update({ status }).eq("id", input.testId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Test not found, or you may not change it.")
}

export async function deleteDraftTest(db: DbClient, testId: string) {
  const { data, error } = await db.from("tests").delete().eq("id", testId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("CONFLICT", "Only drafts that were never published can be deleted. Archive it instead.")
}

export async function addQuestions(db: DbClient, testId: string, questionIds: string[]) {
  const { data, error } = await db.rpc("add_test_questions", { target_test_id: testId, question_ids: questionIds })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function removeTestQuestion(db: DbClient, testQuestionId: string) {
  const { data, error } = await db.from("test_questions").delete().eq("id", testQuestionId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Question not found.")
}

export async function moveTestQuestion(db: DbClient, testQuestionId: string, direction: "up" | "down") {
  const { error } = await db.rpc("move_test_question", { target_question_id: testQuestionId, direction })
  if (error) throw fromPostgrestError(error)
}

export async function setTestQuestionPoints(db: DbClient, testQuestionId: string, points: number) {
  const { data, error } = await db.from("test_questions").update({ points }).eq("id", testQuestionId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Question not found.")
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Every attempt the caller may see, newest first. */
export async function listAttempts(db: DbClient, testId: string, studentId?: string) {
  let query = db
    .from("test_attempts")
    .select(
      "id, student_id, attempt_number, status, started_at, deadline_at, submitted_at, auto_submitted, raw_score, raw_max, score, graded_at, student:students(id, full_name, student_code)"
    )
    .eq("test_id", testId)
    .order("student_id")
    .order("attempt_number", { ascending: false })
  if (studentId) query = query.eq("student_id", studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type AttemptRow = Awaited<ReturnType<typeof listAttempts>>[number]

/** Per-question statistics (the test's teachers only). */
export async function loadQuestionStats(db: DbClient, testId: string) {
  const { data, error } = await db.rpc("test_question_stats", { target_test_id: testId })
  if (error) throw fromPostgrestError(error)
  return data.map((s) => ({
    ...s,
    points: Number(s.points),
    answered: Number(s.answered),
    attempts: Number(s.attempts),
    full_marks: Number(s.full_marks),
    awaiting_review: Number(s.awaiting_review),
    average_score: s.average_score === null ? null : Number(s.average_score),
  }))
}

/** The class roster, to show who has not attempted yet. */
export async function listClassStudents(db: DbClient, classId: string) {
  const { data, error } = await db
    .from("enrollments")
    .select("student:students(id, full_name, student_code)")
    .eq("class_id", classId)
    .in("status", ["active", "completed"])
  if (error) throw fromPostgrestError(error)
  return data.flatMap((e) => (e.student ? [e.student] : [])).sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
}

export async function closeExpiredAttempts(db: DbClient, testId: string) {
  const { data, error } = await db.rpc("close_expired_attempts", { target_test_id: testId })
  if (error) throw fromPostgrestError(error)
  return data
}
