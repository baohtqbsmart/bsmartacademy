import "server-only"

import type { z } from "zod"

import type { levelSchema, subjectSchema } from "@/features/subjects/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

export async function listSubjects(db: DbClient, options: { archived?: boolean } = {}) {
  let query = db
    .from("subjects")
    .select("id, code, name, description, deleted_at, levels(id, name, sort_order, deleted_at), courses(id, deleted_at)")
    .order("name")
  query = options.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map((subject) => ({
    ...subject,
    liveLevels: subject.levels.filter((l) => !l.deleted_at).sort((a, b) => a.sort_order - b.sort_order),
    liveCourseCount: subject.courses.filter((c) => !c.deleted_at).length,
  }))
}

export async function getSubject(db: DbClient, subjectId: string) {
  const { data, error } = await db
    .from("subjects")
    .select(
      "id, code, name, description, deleted_at, levels(id, code, name, sort_order, deleted_at), courses(id, code, name, status, deleted_at, level_id)"
    )
    .eq("id", subjectId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

/** Live subjects with their live levels, for pickers. */
export async function listSubjectOptions(db: DbClient) {
  const { data, error } = await db
    .from("subjects")
    .select("id, code, name, levels(id, name, sort_order, deleted_at)")
    .is("deleted_at", null)
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data.map((subject) => ({
    id: subject.id,
    code: subject.code,
    name: subject.name,
    levels: subject.levels
      .filter((l) => !l.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, name }) => ({ id, name })),
  }))
}

export async function saveSubject(db: DbClient, input: z.output<typeof subjectSchema>) {
  const row = { code: input.code, name: input.name, description: input.description }
  if (input.subjectId) {
    const { data, error } = await db.from("subjects").update(row).eq("id", input.subjectId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("NOT_FOUND", "Subject not found.")
    return input.subjectId
  }
  const { data, error } = await db.from("subjects").insert(row).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function setSubjectArchived(db: DbClient, subjectId: string, archived: boolean) {
  const { data, error } = await db
    .from("subjects")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", subjectId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Subject not found.")
}

export async function saveLevel(db: DbClient, input: z.output<typeof levelSchema>) {
  const row = { subject_id: input.subjectId, code: input.code, name: input.name, sort_order: input.sortOrder }
  const { error } = input.levelId
    ? await db.from("levels").update(row).eq("id", input.levelId)
    : await db.from("levels").insert(row)
  if (error) throw fromPostgrestError(error)
}

export async function setLevelArchived(db: DbClient, levelId: string, archived: boolean) {
  const { data, error } = await db
    .from("levels")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", levelId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Level not found.")
}
