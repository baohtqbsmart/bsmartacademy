import "server-only"

import type { QuestionPayload } from "@/features/question-bank/schemas"
import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import type { CefrLevel, Difficulty, QuestionType } from "@/features/tests/questions"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums, Json } from "@/types/database"

// RLS: staff read the whole (shared) bank; teachers edit their own questions,
// admins any. Students and parents never reach these queries.

export type BankFilters = {
  q?: string
  subjectId?: string
  type?: QuestionType
  skill?: Enums<"assignment_skill">
  cefr?: CefrLevel
  difficulty?: Difficulty
  tag?: string
  archived?: boolean
  mineOnly?: string
}

const COLUMNS = `id, subject_id, question_type, skill, cefr_level, topic, difficulty, prompt, content, media_path, points, tags,
  status, version, duplicated_from, created_by, created_by_name, created_at, updated_at, subject:subjects(id, name)`

export async function listBankQuestions(db: DbClient, filters: BankFilters = {}) {
  let query = db
    .from("bank_questions")
    .select(COLUMNS)
    .eq("status", filters.archived ? "archived" : "active")
    .order("updated_at", { ascending: false })
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId)
  if (filters.type) query = query.eq("question_type", filters.type)
  if (filters.skill) query = query.eq("skill", filters.skill)
  if (filters.cefr) query = query.eq("cefr_level", filters.cefr)
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty)
  if (filters.tag) query = query.contains("tags", [filters.tag.toLowerCase()])
  if (filters.mineOnly) query = query.eq("created_by", filters.mineOnly)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)

  // Accent-insensitive search over the prompt, topic and tags (the bank is small).
  const term = normalizeSearch(filters.q ?? "")
  return term ? data.filter((q) => normalizeSearch(`${q.prompt} ${q.topic ?? ""} ${q.tags.join(" ")}`).includes(term)) : data
}

export type BankQuestion = Awaited<ReturnType<typeof listBankQuestions>>[number]

export async function getBankQuestion(db: DbClient, id: string) {
  const [question, key, usage] = await Promise.all([
    db.from("bank_questions").select(COLUMNS).eq("id", id).maybeSingle(),
    db.from("bank_question_keys").select("answer, explanation").eq("question_id", id).maybeSingle(),
    // Tests using it (RLS: those the caller can see).
    db.from("test_questions").select("test:tests(id, title, status, class:classes(name))").eq("source_question_id", id),
  ])
  if (question.error) throw fromPostgrestError(question.error)
  if (key.error) throw fromPostgrestError(key.error)
  if (usage.error) throw fromPostgrestError(usage.error)
  if (!question.data) return null
  return {
    ...question.data,
    key: key.data,
    usedIn: usage.data.flatMap((u) => (u.test ? [u.test] : [])),
    mediaUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, question.data.media_path),
  }
}

export type BankQuestionDetail = NonNullable<Awaited<ReturnType<typeof getBankQuestion>>>

/** All tags in use, for the filter. */
export async function listTags(db: DbClient) {
  const { data, error } = await db.from("bank_questions").select("tags").eq("status", "active")
  if (error) throw fromPostgrestError(error)
  return [...new Set(data.flatMap((q) => q.tags))].sort()
}

export async function listSubjects(db: DbClient) {
  const { data, error } = await db.from("subjects").select("id, name").is("deleted_at", null).order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function saveBankQuestion(db: DbClient, payload: QuestionPayload) {
  const { data, error } = await db.rpc("save_bank_question", {
    target_question_id: payload.questionId ?? null,
    fields: payload.fields as unknown as Json,
    answer: payload.answer as unknown as Json,
    answer_explanation: payload.explanation,
  })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function duplicateBankQuestion(db: DbClient, id: string) {
  const { data, error } = await db.rpc("duplicate_bank_question", { source_question_id: id })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function setBankQuestionArchived(db: DbClient, id: string, archived: boolean) {
  const { data, error } = await db
    .from("bank_questions")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", id)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only archive your own questions.")
}

/** Attaches uploaded audio or a picture (content checked by signature). */
export async function setQuestionMedia(db: DbClient, input: { questionId: string; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  if (!file.mimeType.startsWith("audio/") && !file.mimeType.startsWith("image/")) {
    await discardUpload(db, input.objectPath)
    throw new AppError("VALIDATION", "Question media must be an audio file or a picture.")
  }
  const { data, error } = await db.from("bank_questions").update({ media_path: input.objectPath }).eq("id", input.questionId).select("id")
  if (error || data.length === 0) {
    await discardUpload(db, input.objectPath)
    if (error) throw fromPostgrestError(error)
    throw new AppError("FORBIDDEN", "You can only change your own questions.")
  }
}

export async function removeQuestionMedia(db: DbClient, questionId: string) {
  const { data, error } = await db.from("bank_questions").update({ media_path: null }).eq("id", questionId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only change your own questions.")
}
