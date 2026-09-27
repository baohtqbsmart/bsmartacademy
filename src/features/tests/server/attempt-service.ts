import "server-only"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"

export async function startTest(db: DbClient, testId: string) {
  const { data, error } = await db.rpc("start_test", { target_test_id: testId })
  if (error) throw fromPostgrestError(error)
  return data
}

/** The caller's attempt row (RLS). */
export async function getAttempt(db: DbClient, attemptId: string) {
  const { data, error } = await db
    .from("test_attempts")
    .select(
      "id, test_id, student_id, attempt_number, status, question_order, option_orders, started_at, deadline_at, submitted_at, auto_submitted, raw_score, raw_max, score, graded_at, student:students(id, full_name, student_code)"
    )
    .eq("id", attemptId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export type Attempt = NonNullable<Awaited<ReturnType<typeof getAttempt>>>

/** The caller's saved responses for an attempt (only the response column is readable). */
export async function getResponses(db: DbClient, attemptId: string) {
  const { data, error } = await db.from("test_answers").select("test_question_id, response").eq("attempt_id", attemptId)
  if (error) throw fromPostgrestError(error)
  return Object.fromEntries(data.map((a) => [a.test_question_id, a.response]))
}

/**
 * Questions, responses and - when the database's review policy allows -
 * marks, feedback and correct answers.
 */
export async function getAttemptDetails(db: DbClient, attemptId: string) {
  const { data, error } = await db.rpc("attempt_details", { target_attempt_id: attemptId })
  if (error) throw fromPostgrestError(error)
  return Promise.all(
    data.map(async (row) => {
      const response = (row.response ?? null) as { file?: { path: string; name: string } } | null
      return {
        ...row,
        points: Number(row.points),
        auto_score: row.auto_score === null ? null : Number(row.auto_score),
        manual_score: row.manual_score === null ? null : Number(row.manual_score),
        mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, row.media_path),
        recordingUrl: response?.file ? await createSignedUrl(db, BUCKETS.assignmentFiles, response.file.path) : null,
      }
    })
  )
}

export type AttemptDetail = Awaited<ReturnType<typeof getAttemptDetails>>[number]

/** Saves one answer (RLS: the student's own open attempt, before its deadline). */
export async function saveAnswer(db: DbClient, input: { attemptId: string; questionId: string; response: Json }) {
  const { error } = await db
    .from("test_answers")
    .upsert({ attempt_id: input.attemptId, test_question_id: input.questionId, response: input.response }, { onConflict: "attempt_id,test_question_id" })
  if (error) {
    if (error.code === "42501") throw new AppError("FORBIDDEN", "This attempt is closed: it was handed in or its time is up.")
    throw fromPostgrestError(error)
  }
}

/** A spoken answer: the uploaded recording is checked (real audio) and saved as the response. */
export async function recordSpokenAnswer(
  db: DbClient,
  input: { attemptId: string; questionId: string; objectPath: string; fileName: string }
) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  if (!file.mimeType.startsWith("audio/")) {
    await discardUpload(db, input.objectPath)
    throw new AppError("VALIDATION", "Please upload an audio recording.")
  }
  try {
    await saveAnswer(db, {
      attemptId: input.attemptId,
      questionId: input.questionId,
      response: { file: { path: input.objectPath, name: file.fileName, mime: file.mimeType, size: file.sizeBytes } },
    })
  } catch (error) {
    await discardUpload(db, input.objectPath)
    throw error
  }
}

export async function submitAttempt(db: DbClient, attemptId: string) {
  const { error } = await db.rpc("submit_test_attempt", { target_attempt_id: attemptId })
  if (error) throw fromPostgrestError(error)
}

export async function gradeAnswer(db: DbClient, input: { attemptId: string; questionId: string; score: number; feedback: string | null }) {
  const { error } = await db.rpc("grade_test_answer", {
    target_attempt_id: input.attemptId,
    target_question_id: input.questionId,
    new_score: input.score,
    new_feedback: input.feedback,
  })
  if (error) throw fromPostgrestError(error)
}
