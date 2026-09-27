import "server-only"

import type { z } from "zod"

import type { AssignmentFormOutput, lifecycleSchema, questionSchema } from "@/features/assignments/schemas"
import { discardUpload, verifyUpload, withDownloadLinks } from "@/features/assignments/server/file-service"
import {
  effectiveStatus,
  LIFECYCLE_TARGET,
  restoreTarget,
  workStatus,
  type AssignmentStatus,
} from "@/features/assignments/status"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

// Every query runs as the signed-in user: RLS shows editors every state and
// everyone else released work only; the database enforces the lifecycle.

const LIST_COLUMNS = `id, title, assignment_type, skill, status, publish_at, published_at, due_at, max_score, time_limit_minutes,
  class:classes(id, name, code, course:courses(name, level:levels(name)))`

export type AssignmentFilters = {
  q?: string
  classId?: string
  status?: AssignmentStatus | "current"
  type?: Enums<"assignment_type">
}

/** Assignments visible to the caller, newest due first. */
export async function listAssignments(db: DbClient, filters: AssignmentFilters = {}) {
  let query = db
    .from("assignments")
    .select(`${LIST_COLUMNS}, submissions(id, student_id, status, is_late, attempt, submitted_at, submission_grades(score, returned_at))`)
    .order("due_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
  if (filters.classId) query = query.eq("class_id", filters.classId)
  if (filters.type) query = query.eq("assignment_type", filters.type)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)

  const now = new Date()
  const term = normalizeSearch(filters.q ?? "")
  return data
    .map((a) => ({ ...a, state: effectiveStatus(a.status, a.publish_at, now) }))
    .filter((a) => {
      if (filters.status === "current") return a.state !== "archived"
      return !filters.status || a.state === filters.status
    })
    .filter((a) => !term || normalizeSearch(`${a.title} ${a.class?.name ?? ""}`).includes(term))
}

export type AssignmentListItem = Awaited<ReturnType<typeof listAssignments>>[number]

/**
 * One row per released assignment and student: the caller themself (student),
 * their children (parent), or one student (profile tab). The latest attempt
 * decides the status; grades appear only once returned (RLS).
 */
export async function listStudentAssignments(db: DbClient, viewer: "staff" | "family", studentId?: string) {
  let enrollmentQuery = db
    .from("enrollments")
    .select("student_id, class_id, student:students(id, full_name)")
    .in("status", ["active", "completed"])
  if (studentId) enrollmentQuery = enrollmentQuery.eq("student_id", studentId)
  const [assignments, enrollments] = await Promise.all([listAssignments(db), enrollmentQuery])
  if (enrollments.error) throw fromPostgrestError(enrollments.error)

  const rows = []
  for (const assignment of assignments) {
    if (assignment.state !== "published" && assignment.state !== "closed") continue
    for (const enrollment of enrollments.data) {
      if (enrollment.class_id !== assignment.class?.id || !enrollment.student) continue
      const latest =
        assignment.submissions
          .filter((s) => s.student_id === enrollment.student_id)
          .sort((a, b) => b.attempt - a.attempt)[0] ?? null
      const grade = latest?.submission_grades?.returned_at ? latest.submission_grades : null
      rows.push({
        key: `${assignment.id}:${enrollment.student_id}`,
        assignment,
        student: enrollment.student,
        latest,
        grade,
        status: workStatus(latest, assignment.due_at, viewer),
      })
    }
  }
  return rows
}

export type StudentAssignmentRow = Awaited<ReturnType<typeof listStudentAssignments>>[number]

export async function getAssignment(db: DbClient, assignmentId: string) {
  const { data, error } = await db
    .from("assignments")
    .select(
      `id, class_id, title, assignment_type, skill, description, instructions, status, publish_at, published_at, due_at,
       time_limit_minutes, max_score, allow_late, requires_file, closed_at, archived_at, created_by_name, created_at,
       class:classes(id, name, code, status, course:courses(id, name, level:levels(name))),
       assignment_questions(id, position, kind, prompt, options, points),
       assignment_attachments(id, object_path, file_name, mime_type, size_bytes, created_at)`
    )
    .eq("id", assignmentId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  return {
    ...data,
    state: effectiveStatus(data.status, data.publish_at),
    questions: [...data.assignment_questions].sort((a, b) => a.position - b.position),
    attachments: await withDownloadLinks(db, data.assignment_attachments),
  }
}

export type AssignmentDetail = NonNullable<Awaited<ReturnType<typeof getAssignment>>>

/** Answer keys (RLS: editors of the assignment only; others get none). */
export async function getAnswerKeys(db: DbClient, questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, AnswerKey>()
  const { data, error } = await db
    .from("assignment_answer_keys")
    .select("question_id, correct_option, accepted_answers, explanation")
    .in("question_id", questionIds)
  if (error) throw fromPostgrestError(error)
  return new Map(data.map((k) => [k.question_id, k]))
}

export type AnswerKey = { question_id: string; correct_option: number | null; accepted_answers: string[] | null; explanation: string | null }

/** Classes the caller may set work for (RLS: a teacher's own classes). */
export async function listAssignableClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, name, code, course:courses(name, level:levels(name))")
    .is("deleted_at", null)
    .in("status", ["planned", "active"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

function toRow(input: AssignmentFormOutput) {
  return {
    class_id: input.classId,
    title: input.title,
    assignment_type: input.assignmentType,
    skill: input.skill,
    description: input.description,
    instructions: input.instructions,
    due_at: input.dueAt,
    time_limit_minutes: input.timeLimitMinutes,
    max_score: input.maxScore,
    allow_late: input.allowLate,
    requires_file: input.requiresFile,
  }
}

/** New assignments always start as drafts. */
export async function createAssignment(db: DbClient, input: AssignmentFormOutput) {
  const { data, error } = await db.from("assignments").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateAssignment(db: DbClient, assignmentId: string, input: AssignmentFormOutput) {
  const { data, error } = await db.from("assignments").update(toRow(input)).eq("id", assignmentId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Assignment not found.")
}

export async function changeAssignmentStatus(db: DbClient, input: z.output<typeof lifecycleSchema>) {
  const target = LIFECYCLE_TARGET[input.action]
  let status: AssignmentStatus
  if (target === "restore") {
    const { data, error } = await db.from("assignments").select("published_at").eq("id", input.assignmentId).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw new AppError("NOT_FOUND", "Assignment not found.")
    status = restoreTarget(data.published_at)
  } else {
    status = target
  }
  const { data, error } = await db
    .from("assignments")
    .update(input.action === "schedule" ? { status, publish_at: input.publishAt } : { status })
    .eq("id", input.assignmentId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Assignment not found, or you may not change it.")
}

/** Deletes a never-published draft (RLS refuses anything else). */
export async function deleteDraft(db: DbClient, assignmentId: string) {
  const { data, error } = await db.from("assignments").delete().eq("id", assignmentId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("CONFLICT", "Only drafts that were never published can be deleted. Archive it instead.")
}

// ---------------------------------------------------------------------------
// Questions (frozen by the database once a student has started)
// ---------------------------------------------------------------------------

export async function saveQuestion(db: DbClient, input: z.output<typeof questionSchema>) {
  const fields = {
    kind: input.kind,
    prompt: input.prompt,
    options: input.kind === "multiple_choice" ? input.options : null,
    points: input.points,
  }
  let questionId = input.questionId
  if (questionId) {
    const { data, error } = await db.from("assignment_questions").update(fields).eq("id", questionId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("NOT_FOUND", "Question not found.")
  } else {
    const { data: last, error: lastError } = await db
      .from("assignment_questions")
      .select("position")
      .eq("assignment_id", input.assignmentId)
      .order("position", { ascending: false })
      .limit(1)
    if (lastError) throw fromPostgrestError(lastError)
    const { data, error } = await db
      .from("assignment_questions")
      .insert({ ...fields, assignment_id: input.assignmentId, position: (last[0]?.position ?? 0) + 1 })
      .select("id")
      .single()
    if (error) throw fromPostgrestError(error)
    questionId = data.id
  }

  const { error: keyError } = await db.from("assignment_answer_keys").upsert({
    question_id: questionId,
    correct_option: input.kind === "multiple_choice" ? input.correctOption : null,
    accepted_answers: input.kind === "short_answer" ? input.acceptedAnswers : null,
    explanation: input.explanation,
  })
  if (keyError) throw fromPostgrestError(keyError)
}

export async function deleteQuestion(db: DbClient, questionId: string) {
  const { data, error } = await db.from("assignment_questions").delete().eq("id", questionId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Question not found.")
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function recordAttachment(db: DbClient, input: { assignmentId: string; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  const { error } = await db.from("assignment_attachments").insert({
    assignment_id: input.assignmentId,
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

export async function removeAttachment(db: DbClient, attachmentId: string) {
  const { data, error } = await db.from("assignment_attachments").delete().eq("id", attachmentId).select("object_path")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Attachment not found, or you may not remove it.")
  await discardUpload(db, data[0].object_path)
}
