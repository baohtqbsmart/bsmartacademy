import "server-only"

import type { z } from "zod"

import type { gradeSchema, saveWorkSchema } from "@/features/assignments/schemas"
import { discardUpload, verifyUpload, withDownloadLinks } from "@/features/assignments/server/file-service"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

const SUBMISSION_COLUMNS = `id, assignment_id, student_id, attempt, status, answers, response_text, started_at, deadline_at,
  submitted_at, is_late, resubmission_allowed, created_at,
  student:students(id, full_name, student_code),
  submission_files(id, object_path, file_name, mime_type, size_bytes, created_at),
  submission_grades(score, feedback, graded_by_name, graded_at, returned_at),
  submission_events(id, event, detail, actor_name, created_at)`

type Answers = Record<string, { choice?: number; text?: string }>

type SubmissionFileRow = { id: string; object_path: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }

async function withFiles<T extends { submission_files: SubmissionFileRow[]; answers: unknown }>(
  db: DbClient,
  submission: T
) {
  return {
    ...submission,
    answers: (submission.answers ?? {}) as Answers,
    files: await withDownloadLinks<SubmissionFileRow>(db, submission.submission_files),
  }
}

/** All attempts by one student (or the caller, via RLS) on an assignment, oldest first. */
export async function listAttempts(db: DbClient, assignmentId: string, studentId?: string) {
  let query = db.from("submissions").select(SUBMISSION_COLUMNS).eq("assignment_id", assignmentId).order("attempt")
  if (studentId) query = query.eq("student_id", studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return Promise.all(data.map((s) => withFiles(db, s)))
}

export type Attempt = Awaited<ReturnType<typeof listAttempts>>[number]

export async function getSubmission(db: DbClient, submissionId: string) {
  const { data, error } = await db.from("submissions").select(SUBMISSION_COLUMNS).eq("id", submissionId).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data ? withFiles(db, data) : null
}

/**
 * The class roster for an assignment with each student's latest attempt
 * (RLS: a teacher sees the students they teach).
 */
export async function listSubmissionRoster(db: DbClient, assignmentId: string, classId: string) {
  const [enrolled, attempts] = await Promise.all([
    db
      .from("enrollments")
      .select("student:students(id, full_name, student_code)")
      .eq("class_id", classId)
      .in("status", ["active", "completed"]),
    db
      .from("submissions")
      .select("id, student_id, attempt, status, submitted_at, is_late, resubmission_allowed, submission_grades(score, returned_at)")
      .eq("assignment_id", assignmentId)
      .order("attempt", { ascending: false }),
  ])
  if (enrolled.error) throw fromPostgrestError(enrolled.error)
  if (attempts.error) throw fromPostgrestError(attempts.error)

  const latest = new Map<string, (typeof attempts.data)[number]>()
  for (const a of attempts.data) if (!latest.has(a.student_id)) latest.set(a.student_id, a)
  const students = new Map<string, { id: string; full_name: string; student_code: string }>()
  for (const { student } of enrolled.data) if (student) students.set(student.id, student)

  return [...students.values()]
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
    .map((student) => {
      const attempt = latest.get(student.id) ?? null
      return { student, attempt, grade: attempt?.submission_grades ?? null }
    })
}

export type RosterRow = Awaited<ReturnType<typeof listSubmissionRoster>>[number]

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export async function startSubmission(db: DbClient, assignmentId: string) {
  const { data, error } = await db.rpc("start_submission", { target_assignment_id: assignmentId })
  if (error) throw fromPostgrestError(error)
  return data
}

/** Saves work in progress (RLS: only the student's own open attempt). */
export async function saveWork(db: DbClient, input: z.output<typeof saveWorkSchema>) {
  const { data, error } = await db
    .from("submissions")
    .update({ answers: input.answers, response_text: input.responseText })
    .eq("id", input.submissionId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("CONFLICT", "This work has already been handed in and can no longer be changed.")
}

export async function submitWork(db: DbClient, submissionId: string) {
  const { data, error } = await db.rpc("submit_submission", { target_submission_id: submissionId })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function recordSubmissionFile(db: DbClient, input: { submissionId: string; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  const { error } = await db.from("submission_files").insert({
    submission_id: input.submissionId,
    object_path: input.objectPath,
    file_name: file.fileName,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
  })
  if (error) {
    await discardUpload(db, input.objectPath)
    throw fromPostgrestError(error)
  }
}

export async function removeSubmissionFile(db: DbClient, fileId: string) {
  const { data, error } = await db.from("submission_files").delete().eq("id", fileId).select("object_path")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "File not found, or the work has been handed in.")
  await discardUpload(db, data[0].object_path)
}

/** The caller's (student) or their children's (parent) work on released assignments. */
export async function listStudentWork(db: DbClient, studentId?: string) {
  let query = db
    .from("submissions")
    .select("id, assignment_id, student_id, attempt, status, is_late, submitted_at, submission_grades(score, feedback, returned_at)")
    .order("attempt", { ascending: false })
  if (studentId) query = query.eq("student_id", studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

export async function gradeSubmission(db: DbClient, input: z.output<typeof gradeSchema>) {
  const { error } = await db.rpc("grade_submission", {
    target_submission_id: input.submissionId,
    new_score: input.score,
    new_feedback: input.feedback,
    publish: input.publish,
  })
  if (error) throw fromPostgrestError(error)
}

export async function returnGrades(db: DbClient, assignmentId: string, submissionId?: string) {
  const { data, error } = await db.rpc("return_grades", {
    target_assignment_id: assignmentId,
    target_submission_id: submissionId ?? null,
  })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function setResubmission(db: DbClient, submissionId: string, allowed: boolean) {
  const { error } = await db.rpc("set_resubmission", { target_submission_id: submissionId, allowed })
  if (error) throw fromPostgrestError(error)
}

export async function getAutoMarks(db: DbClient, submissionId: string) {
  const { data, error } = await db.rpc("submission_auto_marks", { target_submission_id: submissionId })
  if (error) throw fromPostgrestError(error)
  return new Map(data.map((m) => [m.question_id, m]))
}
