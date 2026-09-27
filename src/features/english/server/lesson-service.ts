import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import type { lessonSchema, lessonWorkSchema, reviewSchema } from "@/features/english/schemas"
import type { ContentStatus, LessonSkill } from "@/features/english/skills"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"

// RLS: published lessons for every reader; drafts for content editors.
// Exercise keys are staff-only (students see answers through
// lesson_attempt_review after handing in); transcripts and model answers
// appear once the student has done the lesson.

export type Mistake = { incorrect: string; correct: string; note?: string }
export type RubricCriterion = { criterion: string; description?: string; max_points: number }

export async function listLessons(db: DbClient, filters: { skill?: LessonSkill; status?: ContentStatus } = {}) {
  let query = db
    .from("lessons")
    .select("id, skill, title, cefr_level, topic, summary, status, response_mode, created_by, created_by_name, published_at, lesson_questions(count)")
    .order("title")
  if (filters.skill) query = query.eq("skill", filters.skill)
  query = filters.status ? query.eq("status", filters.status) : query.neq("status", "archived")
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map((l) => ({ ...l, exerciseCount: l.lesson_questions[0]?.count ?? 0 }))
}

export type LessonListItem = Awaited<ReturnType<typeof listLessons>>[number]

export async function getLesson(db: DbClient, id: string) {
  const [lesson, questions, words, secret] = await Promise.all([
    db
      .from("lessons")
      .select(
        "id, skill, title, cefr_level, topic, summary, body, form, usage, examples, common_mistakes, media_path, response_mode, min_words, max_words, rubric, max_score, status, published_at, created_by, created_by_name, updated_at, slug, public_access"
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("lesson_questions")
      .select("id, position, source_question_id, question_type, prompt, content, media_path, points")
      .eq("lesson_id", id)
      .order("position"),
    db.from("lesson_words").select("word:vocabulary_words(id, word, ipa, part_of_speech, meaning_vi, definition_en)").eq("lesson_id", id),
    // Transcript / model answer: staff, or after the student has done the lesson (RLS).
    db.from("lesson_private").select("transcript, model_answer").eq("lesson_id", id).maybeSingle(),
  ])
  for (const result of [lesson, questions, words, secret]) if (result.error) throw fromPostgrestError(result.error)
  if (!lesson.data) return null
  return {
    ...lesson.data,
    mistakes: (lesson.data.common_mistakes ?? []) as Mistake[],
    rubricItems: (lesson.data.rubric ?? []) as RubricCriterion[],
    questions: await Promise.all(
      (questions.data ?? []).map(async (q) => ({ ...q, points: Number(q.points), mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, q.media_path) }))
    ),
    words: (words.data ?? []).flatMap((w) => (w.word ? [w.word] : [])),
    secret: secret.data,
    mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, lesson.data.media_path),
  }
}

export type Lesson = NonNullable<Awaited<ReturnType<typeof getLesson>>>

/** Exercise keys (content editors only; others get none from RLS). */
export async function listLessonKeys(db: DbClient, questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, { answer: Json; explanation: string | null }>()
  const { data, error } = await db.from("lesson_question_keys").select("lesson_question_id, answer, explanation").in("lesson_question_id", questionIds)
  if (error) throw fromPostgrestError(error)
  return new Map(data.map((k) => [k.lesson_question_id, k]))
}

function toRow(input: z.output<typeof lessonSchema>) {
  const work = input.skill === "speaking" || input.skill === "writing" || input.skill === "pronunciation"
  return {
    title: input.title,
    cefr_level: input.cefrLevel,
    topic: input.topic,
    summary: input.summary,
    body: input.body,
    form: input.skill === "grammar" ? input.form : null,
    usage: input.skill === "grammar" ? input.usage : null,
    examples: input.skill === "grammar" ? input.examples : [],
    common_mistakes: (input.skill === "grammar"
      ? input.mistakes.map((m) => ({ incorrect: m.incorrect, correct: m.correct, ...(m.note ? { note: m.note } : {}) }))
      : []) as Json,
    response_mode: work && input.responseMode ? input.responseMode : null,
    min_words: input.skill === "writing" ? input.minWords : null,
    max_words: input.skill === "writing" ? input.maxWords : null,
    rubric: (work ? input.rubric.map((r) => ({ criterion: r.criterion, description: r.description, max_points: Number(r.maxPoints.replace(",", ".")) })) : []) as Json,
    max_score: input.maxScore,
  }
}

export async function saveLesson(db: DbClient, input: z.output<typeof lessonSchema>) {
  let id = input.lessonId
  if (id) {
    const { data, error } = await db.from("lessons").update(toRow(input)).eq("id", id).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("FORBIDDEN", "You can only edit your own lessons.")
  } else {
    const { data, error } = await db
      .from("lessons")
      .insert({ ...toRow(input), skill: input.skill as LessonSkill })
      .select("id")
      .single()
    if (error) throw fromPostgrestError(error)
    id = data.id
  }

  const { error: privateError } = await db
    .from("lesson_private")
    .upsert({ lesson_id: id, transcript: input.skill === "listening" ? input.transcript : null, model_answer: input.modelAnswer })
  if (privateError) throw fromPostgrestError(privateError)

  const { error: clearError } = await db.from("lesson_words").delete().eq("lesson_id", id)
  if (clearError) throw fromPostgrestError(clearError)
  if (input.wordIds.length > 0) {
    const { error } = await db.from("lesson_words").insert(input.wordIds.map((word_id) => ({ lesson_id: id!, word_id })))
    if (error) throw fromPostgrestError(error)
  }
  return id
}

export async function setLessonStatus(db: DbClient, lessonId: string, status: ContentStatus) {
  const { data, error } = await db.from("lessons").update({ status }).eq("id", lessonId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only change your own lessons.")
}

export async function setLessonMedia(db: DbClient, input: { lessonId: string; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  if (!/^(audio|image|video)\//.test(file.mimeType) || file.mimeType === "video/quicktime") {
    await discardUpload(db, input.objectPath)
    throw new AppError("VALIDATION", "Lesson media must be audio, a picture or an MP4 video.")
  }
  const { data, error } = await db.from("lessons").update({ media_path: input.objectPath }).eq("id", input.lessonId).select("id")
  if (error || data.length === 0) {
    await discardUpload(db, input.objectPath)
    if (error) throw fromPostgrestError(error)
    throw new AppError("FORBIDDEN", "You can only change your own lessons.")
  }
}

export async function addLessonQuestions(db: DbClient, lessonId: string, questionIds: string[]) {
  const { data, error } = await db.rpc("add_lesson_questions", { target_lesson_id: lessonId, question_ids: questionIds })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function removeLessonQuestion(db: DbClient, lessonQuestionId: string) {
  const { data, error } = await db.from("lesson_questions").delete().eq("id", lessonQuestionId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Exercise not found.")
}

// ---------------------------------------------------------------------------
// Student work
// ---------------------------------------------------------------------------

export async function submitPractice(db: DbClient, lessonId: string, responses: Json) {
  const { data, error } = await db.rpc("submit_lesson_practice", { target_lesson_id: lessonId, responses })
  if (error) throw fromPostgrestError(error)
  return data
}

/** Attempts the caller may read for a lesson, newest first. */
export async function listLessonAttempts(db: DbClient, lessonId: string, studentId?: string) {
  let query = db
    .from("lesson_attempts")
    .select("id, student_id, score, max_score, created_at, student:students(full_name)")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
  if (studentId) query = query.eq("student_id", studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export async function getAttemptReview(db: DbClient, attemptId: string) {
  const { data, error } = await db.rpc("lesson_attempt_review", { target_attempt_id: attemptId })
  if (error) throw fromPostgrestError(error)
  return data.map((r) => ({ ...r, points: Number(r.points), score: r.score === null ? null : Number(r.score) }))
}

export async function submitWork(db: DbClient, input: z.output<typeof lessonWorkSchema>) {
  let file: Json | null = null
  if (input.file) {
    const verified = await verifyUpload(db, input.file.objectPath, input.file.fileName)
    file = { path: input.file.objectPath, name: verified.fileName, mime: verified.mimeType, size: verified.sizeBytes }
  }
  const { data, error } = await db.rpc("submit_lesson_work", { target_lesson_id: input.lessonId, response_text: input.text, file })
  if (error) {
    if (input.file) await discardUpload(db, input.file.objectPath)
    throw fromPostgrestError(error)
  }
  return data
}

const SUBMISSION_COLUMNS = `id, lesson_id, student_id, attempt, text_response, file_path, file_name, file_mime, status, feedback,
  rubric_scores, score, max_score, reviewed_by_name, reviewed_at, submitted_at,
  student:students(id, full_name, student_code), lesson:lessons(id, title, skill, rubric, response_mode, min_words, max_words)`

export async function listSubmissions(db: DbClient, filters: { lessonId?: string; studentId?: string; status?: "submitted" | "reviewed" } = {}) {
  let query = db.from("lesson_submissions").select(SUBMISSION_COLUMNS).order("submitted_at", { ascending: false }).limit(200)
  if (filters.lessonId) query = query.eq("lesson_id", filters.lessonId)
  if (filters.studentId) query = query.eq("student_id", filters.studentId)
  if (filters.status) query = query.eq("status", filters.status)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type LessonSubmission = Awaited<ReturnType<typeof listSubmissions>>[number]

export async function getSubmission(db: DbClient, id: string) {
  const { data, error } = await db.from("lesson_submissions").select(SUBMISSION_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  return { ...data, fileUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, data.file_path) }
}

export async function reviewSubmission(db: DbClient, input: z.output<typeof reviewSchema>) {
  const { error } = await db.rpc("review_lesson_submission", {
    target_submission_id: input.submissionId,
    review_feedback: input.feedback,
    criterion_scores: input.rubricScores,
    overall_score: input.score,
  })
  if (error) throw fromPostgrestError(error)
}
