import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import type { annotationSchema, commentSchema, gradeSchema, rubricSchema, submitSchema, taskSchema, updateAnnotationSchema } from "@/features/assessments/schemas"
import type { Criterion } from "@/features/assessments/scoring"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"

// Every query runs as the caller. RLS: class teachers see and grade their
// classes; students and parents see published tasks, their own work, and
// grades and comments once returned.

const toCriteria = (value: Json) => (value ?? []) as Criterion[]

// --- Rubric templates ------------------------------------------------------

export async function listRubrics(db: DbClient) {
  const { data, error } = await db
    .from("assessment_rubrics")
    .select("id, name, kind, scoring, criteria, description, is_system, created_by, created_by_name, archived_at")
    .is("archived_at", null)
    .order("is_system", { ascending: false })
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data.map((r) => ({ ...r, criteriaList: toCriteria(r.criteria) }))
}

export type Rubric = Awaited<ReturnType<typeof listRubrics>>[number]

export async function saveRubric(db: DbClient, input: z.output<typeof rubricSchema>) {
  const row = {
    name: input.name,
    scoring: input.scoring,
    description: input.description,
    criteria: input.criteria.map((c) => ({ name: c.name, description: c.description || undefined, max_points: Number(c.maxPoints.replace(",", ".")) })) as Json,
  }
  if (input.rubricId) {
    const { data, error } = await db.from("assessment_rubrics").update(row).eq("id", input.rubricId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("FORBIDDEN", "Built-in rubrics cannot be edited; you can edit your own.")
    return
  }
  const { error } = await db.from("assessment_rubrics").insert({ ...row, kind: input.kind })
  if (error) throw fromPostgrestError(error)
}

export async function archiveRubric(db: DbClient, rubricId: string) {
  const { data, error } = await db.from("assessment_rubrics").update({ archived_at: new Date().toISOString() }).eq("id", rubricId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "Built-in rubrics cannot be archived.")
}

// --- Tasks -----------------------------------------------------------------

const TASK_COLUMNS = `id, class_id, kind, title, cefr_level, task, instructions, media_path, response_mode, min_words, max_words,
  max_duration_seconds, rubric_id, scoring, criteria, max_score, max_attempts, due_at, allow_late, status, published_at, closed_at,
  created_by_name, created_at, class:classes(id, name)`

export async function listTasks(db: DbClient, filters: { classId?: string; kind?: "writing" | "speaking"; archived?: boolean } = {}) {
  let query = db
    .from("assessment_tasks")
    .select(`${TASK_COLUMNS}, assessment_submissions(id, student_id, attempt, status, is_late)`)
    .order("created_at", { ascending: false })
  query = filters.archived ? query.eq("status", "archived") : query.neq("status", "archived")
  if (filters.classId) query = query.eq("class_id", filters.classId)
  if (filters.kind) query = query.eq("kind", filters.kind)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map((t) => ({ ...t, criteriaList: toCriteria(t.criteria) }))
}

export type TaskListItem = Awaited<ReturnType<typeof listTasks>>[number]

export async function getTask(db: DbClient, id: string) {
  const { data, error } = await db.from("assessment_tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  return { ...data, criteriaList: toCriteria(data.criteria), mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, data.media_path) }
}

export type Task = NonNullable<Awaited<ReturnType<typeof getTask>>>

export async function listAssessmentClasses(db: DbClient) {
  const { data, error } = await db.from("classes").select("id, name").is("deleted_at", null).in("status", ["planned", "active"]).order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function saveTask(db: DbClient, input: z.output<typeof taskSchema>) {
  const writing = input.kind === "writing"
  const row = {
    class_id: input.classId,
    title: input.title,
    cefr_level: input.cefrLevel,
    task: input.task,
    instructions: input.instructions,
    response_mode: input.responseMode,
    min_words: writing ? input.minWords : null,
    max_words: writing ? input.maxWords : null,
    max_duration_seconds: writing ? null : input.maxDurationSeconds,
    rubric_id: input.rubricId,
    scoring: input.scoring,
    criteria: input.criteria.map((c) => ({ name: c.name, description: c.description || undefined, max_points: Number(c.maxPoints.replace(",", ".")) })) as Json,
    max_score: 0, // set by the database from the criteria
    max_attempts: input.maxAttempts,
    due_at: input.dueAt,
    allow_late: input.allowLate,
  }
  if (input.taskId) {
    const { data, error } = await db.from("assessment_tasks").update(row).eq("id", input.taskId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("NOT_FOUND", "Task not found.")
    return input.taskId
  }
  const { data, error } = await db.from("assessment_tasks").insert({ ...row, kind: input.kind }).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function changeTaskStatus(db: DbClient, taskId: string, action: "publish" | "close" | "reopen" | "archive" | "restore") {
  const update =
    action === "publish"
      ? { status: "published" as const }
      : action === "close"
        ? { closed_at: new Date().toISOString() }
        : action === "reopen"
          ? { closed_at: null }
          : action === "archive"
            ? { status: "archived" as const }
            : { status: "published" as const }
  const { data, error } = await db.from("assessment_tasks").update(update).eq("id", taskId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Task not found, or you may not change it.")
}

export async function deleteDraftTask(db: DbClient, taskId: string) {
  const { data, error } = await db.from("assessment_tasks").delete().eq("id", taskId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("CONFLICT", "Only unpublished drafts can be deleted.")
}

// --- Submissions -----------------------------------------------------------

const SUBMISSION_COLUMNS = `id, task_id, student_id, attempt, text_response, word_count, file_path, file_name, file_mime, status, is_late,
  resubmission_allowed, submitted_at, student:students(id, full_name, student_code),
  assessment_grades(criterion_scores, total_score, feedback, graded_by_name, graded_at, returned_at),
  assessment_events(id, event, actor_name, created_at)`

export async function listTaskSubmissions(db: DbClient, taskId: string, studentId?: string) {
  let query = db.from("assessment_submissions").select(SUBMISSION_COLUMNS).eq("task_id", taskId).order("submitted_at", { ascending: false })
  if (studentId) query = query.eq("student_id", studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type SubmissionRow = Awaited<ReturnType<typeof listTaskSubmissions>>[number]

export async function getSubmission(db: DbClient, id: string) {
  const [submission, annotations] = await Promise.all([
    db.from("assessment_submissions").select(SUBMISSION_COLUMNS).eq("id", id).maybeSingle(),
    // RLS: graders always; students and parents once returned.
    db
      .from("assessment_annotations")
      .select("id, anchor, start_offset, end_offset, quote, time_seconds, category, comment, suggestion, source, created_by_name, created_at")
      .eq("submission_id", id)
      .order("start_offset", { nullsFirst: false })
      .order("time_seconds", { nullsFirst: false })
      .order("created_at"),
  ])
  if (submission.error) throw fromPostgrestError(submission.error)
  if (annotations.error) throw fromPostgrestError(annotations.error)
  if (!submission.data) return null
  return {
    ...submission.data,
    annotations: annotations.data,
    fileUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, submission.data.file_path, submission.data.file_name ?? undefined),
    playUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, submission.data.file_path),
  }
}

export type Submission = NonNullable<Awaited<ReturnType<typeof getSubmission>>>
export type Annotation = Submission["annotations"][number]

/** Everything a student has handed in (RLS: own / children / taught), newest first. */
export async function listHistory(db: DbClient, studentId: string) {
  const { data, error } = await db
    .from("assessment_submissions")
    .select(`${SUBMISSION_COLUMNS}, task:assessment_tasks(id, title, kind, scoring, criteria, max_score, cefr_level, class:classes(name))`)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data.map((s) => ({ ...s, criteriaList: toCriteria(s.task?.criteria ?? []) }))
}

export type HistoryRow = Awaited<ReturnType<typeof listHistory>>[number]

export async function submitWork(db: DbClient, input: z.output<typeof submitSchema>) {
  let file: Json | null = null
  if (input.file) {
    const verified = await verifyUpload(db, input.file.objectPath, input.file.fileName)
    file = { path: input.file.objectPath, name: verified.fileName, mime: verified.mimeType, size: verified.sizeBytes }
  }
  const { data, error } = await db.rpc("submit_assessment", { target_task_id: input.taskId, response_text: input.text, file })
  if (error) {
    if (input.file) await discardUpload(db, input.file.objectPath)
    throw fromPostgrestError(error)
  }
  return data
}

// --- Grading ---------------------------------------------------------------

export async function gradeWork(db: DbClient, input: z.output<typeof gradeSchema>) {
  const { data, error } = await db.rpc("grade_assessment", {
    target_submission_id: input.submissionId,
    scores: input.scores,
    overall_feedback: input.feedback,
    publish: input.publish,
  })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function returnGrades(db: DbClient, taskId: string, submissionId?: string) {
  const { data, error } = await db.rpc("return_assessment_grades", { target_task_id: taskId, target_submission_id: submissionId ?? null })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function setResubmission(db: DbClient, submissionId: string, allowed: boolean) {
  const { error } = await db.rpc("set_assessment_resubmission", { target_submission_id: submissionId, allowed })
  if (error) throw fromPostgrestError(error)
}

export async function addAnnotation(db: DbClient, input: z.output<typeof annotationSchema>) {
  const { error } = await db.from("assessment_annotations").insert({
    submission_id: input.submissionId,
    anchor: input.anchor,
    start_offset: input.anchor === "text" ? input.start : null,
    end_offset: input.anchor === "text" ? input.end : null,
    time_seconds: input.anchor === "time" ? input.time : null,
    category: input.category,
    comment: input.comment,
    suggestion: input.suggestion,
  })
  if (error) throw fromPostgrestError(error)
}

export async function updateAnnotation(db: DbClient, input: z.output<typeof updateAnnotationSchema>) {
  const { data, error } = await db
    .from("assessment_annotations")
    .update({ category: input.category, comment: input.comment, suggestion: input.suggestion })
    .eq("id", input.annotationId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Comment not found.")
}

export async function deleteAnnotation(db: DbClient, annotationId: string) {
  const { data, error } = await db.from("assessment_annotations").delete().eq("id", annotationId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Comment not found.")
}

// --- Reusable comments -----------------------------------------------------

export async function listComments(db: DbClient) {
  const { data, error } = await db
    .from("feedback_comments")
    .select("id, kind, category, body, shared, created_by, created_by_name")
    .order("category")
    .order("body")
  if (error) throw fromPostgrestError(error)
  return data
}

export type FeedbackComment = Awaited<ReturnType<typeof listComments>>[number]

export async function saveComment(db: DbClient, input: z.output<typeof commentSchema>) {
  const row = { kind: input.kind, category: input.category, body: input.body, shared: input.shared }
  if (input.commentId) {
    const { data, error } = await db.from("feedback_comments").update(row).eq("id", input.commentId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("FORBIDDEN", "You can only edit your own comments.")
    return
  }
  const { error } = await db.from("feedback_comments").insert(row)
  if (error) throw fromPostgrestError(error)
}

export async function deleteComment(db: DbClient, commentId: string) {
  const { data, error } = await db.from("feedback_comments").delete().eq("id", commentId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only delete your own comments.")
}
