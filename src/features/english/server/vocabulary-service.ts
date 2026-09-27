import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import type { practiceSchema, setSchema, wordSchema } from "@/features/english/schemas"
import type { ContentStatus, PartOfSpeech, PracticeWord } from "@/features/english/skills"
import type { CefrLevel } from "@/features/tests/questions"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import { todayInAcademy } from "@/lib/dates"

// RLS: published words and sets for every reader; drafts for content editors;
// teachers edit their own content, admins any.

const WORD_COLUMNS =
  "id, word, ipa, part_of_speech, meaning_vi, definition_en, example, audio_path, image_path, collocations, synonyms, antonyms, cefr_level, topic, status, created_by, created_by_name"

export async function listWords(
  db: DbClient,
  filters: { q?: string; topic?: string; cefr?: CefrLevel; pos?: PartOfSpeech; status?: ContentStatus } = {}
) {
  let query = db.from("vocabulary_words").select(WORD_COLUMNS).order("word")
  query = query.eq("status", filters.status ?? "published")
  if (filters.topic) query = query.eq("topic", filters.topic)
  if (filters.cefr) query = query.eq("cefr_level", filters.cefr)
  if (filters.pos) query = query.eq("part_of_speech", filters.pos)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const term = normalizeSearch(filters.q ?? "")
  return term
    ? data.filter((w) => normalizeSearch(`${w.word} ${w.meaning_vi} ${w.definition_en ?? ""} ${w.topic ?? ""}`).includes(term))
    : data
}

export type Word = Awaited<ReturnType<typeof listWords>>[number]

/** Signed URLs for the words' audio and pictures. */
export async function withWordMedia<T extends { audio_path: string | null; image_path: string | null }>(db: DbClient, words: T[]) {
  return Promise.all(
    words.map(async (w) => ({
      ...w,
      audioUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, w.audio_path),
      imageUrl: await createSignedUrl(db, BUCKETS.assignmentFiles, w.image_path),
    }))
  )
}

export async function getWord(db: DbClient, id: string) {
  const { data, error } = await db.from("vocabulary_words").select(WORD_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data ? (await withWordMedia(db, [data]))[0] : null
}

export async function listTopics(db: DbClient) {
  const { data, error } = await db.from("vocabulary_words").select("topic").not("topic", "is", null)
  if (error) throw fromPostgrestError(error)
  return [...new Set(data.map((w) => w.topic!))].sort()
}

export async function saveWord(db: DbClient, input: z.output<typeof wordSchema>) {
  const row = {
    word: input.word,
    ipa: input.ipa,
    part_of_speech: input.partOfSpeech,
    meaning_vi: input.meaningVi,
    definition_en: input.definitionEn,
    example: input.example,
    collocations: input.collocations,
    synonyms: input.synonyms,
    antonyms: input.antonyms,
    cefr_level: input.cefrLevel,
    topic: input.topic,
    status: input.published ? ("published" as const) : ("draft" as const),
  }
  if (input.wordId) {
    const { data, error } = await db.from("vocabulary_words").update(row).eq("id", input.wordId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("FORBIDDEN", "You can only edit your own words.")
    return input.wordId
  }
  const { data, error } = await db.from("vocabulary_words").insert(row).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function setWordStatus(db: DbClient, wordId: string, status: ContentStatus) {
  const { data, error } = await db.from("vocabulary_words").update({ status }).eq("id", wordId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only change your own words.")
}

/** Attaches uploaded audio or a picture (content checked by its signature). */
export async function setWordMedia(db: DbClient, input: { wordId: string; field: "audio" | "image"; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  const wanted = input.field === "audio" ? "audio/" : "image/"
  if (!file.mimeType.startsWith(wanted)) {
    await discardUpload(db, input.objectPath)
    throw new AppError("VALIDATION", input.field === "audio" ? "Please upload an audio file." : "Please upload a picture.")
  }
  const update = input.field === "audio" ? { audio_path: input.objectPath } : { image_path: input.objectPath }
  const { data, error } = await db.from("vocabulary_words").update(update).eq("id", input.wordId).select("id")
  if (error || data.length === 0) {
    await discardUpload(db, input.objectPath)
    if (error) throw fromPostgrestError(error)
    throw new AppError("FORBIDDEN", "You can only change your own words.")
  }
}

export async function clearWordMedia(db: DbClient, wordId: string, field: "audio" | "image") {
  const { data, error } = await db
    .from("vocabulary_words")
    .update(field === "audio" ? { audio_path: null } : { image_path: null })
    .eq("id", wordId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only change your own words.")
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export async function listSets(db: DbClient) {
  const { data, error } = await db
    .from("vocabulary_sets")
    .select("id, title, description, cefr_level, topic, status, created_by, created_by_name, vocabulary_set_words(count)")
    .neq("status", "archived")
    .order("title")
  if (error) throw fromPostgrestError(error)
  return data.map((s) => ({ ...s, wordCount: s.vocabulary_set_words[0]?.count ?? 0 }))
}

export async function getSet(db: DbClient, id: string) {
  const { data, error } = await db
    .from("vocabulary_sets")
    .select(`id, title, description, cefr_level, topic, status, created_by, created_by_name,
      vocabulary_set_words(position, word:vocabulary_words(${WORD_COLUMNS}))`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  const words = data.vocabulary_set_words
    .sort((a, b) => a.position - b.position)
    .flatMap((w) => (w.word ? [w.word] : []))
  return { ...data, words: await withWordMedia(db, words) }
}

export type WordSet = NonNullable<Awaited<ReturnType<typeof getSet>>>

export function toPracticeWords(words: WordSet["words"]): PracticeWord[] {
  return words.map((w) => ({
    id: w.id,
    word: w.word,
    ipa: w.ipa,
    part_of_speech: w.part_of_speech,
    meaning_vi: w.meaning_vi,
    definition_en: w.definition_en,
    example: w.example,
    audioUrl: w.audioUrl,
    imageUrl: w.imageUrl,
  }))
}

export async function saveSet(db: DbClient, input: z.output<typeof setSchema>) {
  const row = { title: input.title, description: input.description, cefr_level: input.cefrLevel, topic: input.topic }
  if (input.setId) {
    const { data, error } = await db.from("vocabulary_sets").update(row).eq("id", input.setId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("FORBIDDEN", "You can only edit your own sets.")
    return input.setId
  }
  const { data, error } = await db.from("vocabulary_sets").insert(row).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

/** Replaces the set's words (keeps the given order). */
export async function setSetWords(db: DbClient, setId: string, wordIds: string[]) {
  const { error: deleteError } = await db.from("vocabulary_set_words").delete().eq("set_id", setId)
  if (deleteError) throw fromPostgrestError(deleteError)
  if (wordIds.length === 0) return
  const { error } = await db.from("vocabulary_set_words").insert(wordIds.map((word_id, i) => ({ set_id: setId, word_id, position: i + 1 })))
  if (error) throw fromPostgrestError(error)
}

export async function setSetStatus(db: DbClient, setId: string, status: ContentStatus) {
  const { data, error } = await db.from("vocabulary_sets").update({ status }).eq("id", setId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only change your own sets.")
}

// ---------------------------------------------------------------------------
// Practice and progress
// ---------------------------------------------------------------------------

export async function recordPractice(db: DbClient, input: z.output<typeof practiceSchema>) {
  const { data, error } = await db.rpc("record_vocabulary_practice", {
    target_set_id: input.setId,
    target_activity: input.activity,
    results: input.results.map((r) => ({ word_id: r.wordId, correct: r.correct })),
  })
  if (error) throw fromPostgrestError(error)
  return data
}

/** Per-word progress rows the caller may read (a student's own, a child's...). */
export async function listProgress(db: DbClient, studentId: string) {
  const { data, error } = await db
    .from("vocabulary_progress")
    .select("word_id, box, correct_count, wrong_count, last_practiced_at, next_review_on")
    .eq("student_id", studentId)
  if (error) throw fromPostgrestError(error)
  return data
}

export function dueCount(progress: { next_review_on: string }[], today = todayInAcademy()) {
  return progress.filter((p) => p.next_review_on <= today).length
}
