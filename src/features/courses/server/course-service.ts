import "server-only"

import type { z } from "zod"

import type { CourseFormOutput, unitSchema } from "@/features/courses/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

const CURRENT_CLASS = new Set(["planned", "active"])

/** Course catalogue visible to the caller (drafts only for course editors). */
export async function listCourses(
  db: DbClient,
  filters: { q?: string; status?: Enums<"course_status">; subjectId?: string; archived?: boolean } = {}
) {
  let query = db
    .from("courses")
    .select(
      `id, code, name, status, session_count, session_minutes, duration_weeks, deleted_at,
       subject:subjects(id, name), level:levels(name), course_units(id), classes(id, status, deleted_at)`
    )
    .order("code")
  query = filters.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (filters.status) query = query.eq("status", filters.status)
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId)

  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const term = normalizeSearch(filters.q ?? "")
  return data
    .filter((c) => !term || normalizeSearch(`${c.name} ${c.code}`).includes(term))
    .map((c) => ({
      ...c,
      unitCount: c.course_units.length,
      currentClassCount: c.classes.filter((k) => !k.deleted_at && CURRENT_CLASS.has(k.status)).length,
    }))
}

export async function getCourse(db: DbClient, courseId: string) {
  const { data, error } = await db
    .from("courses")
    .select(
      `id, code, name, description, status, subject_id, level_id, session_count, session_minutes, duration_weeks, deleted_at,
       subject:subjects(id, name), level:levels(id, name),
       course_units(id, position, title, description, session_count),
       classes(id, code, name, status, start_date, end_date, deleted_at)`
    )
    .eq("id", courseId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  return { ...data, course_units: [...data.course_units].sort((a, b) => a.position - b.position) }
}

/** Active courses, for the class form. */
export async function listActiveCourseOptions(db: DbClient) {
  const { data, error } = await db
    .from("courses")
    .select("id, code, name")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

function toRow(input: CourseFormOutput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    subject_id: input.subjectId,
    level_id: input.levelId,
    session_count: input.sessionCount,
    session_minutes: input.sessionMinutes,
    duration_weeks: input.durationWeeks,
    status: input.status,
  }
}

export async function createCourse(db: DbClient, input: CourseFormOutput) {
  const { data, error } = await db.from("courses").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateCourse(db: DbClient, courseId: string, input: CourseFormOutput) {
  const { data, error } = await db.from("courses").update(toRow(input)).eq("id", courseId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Course not found.")
}

export async function setCourseArchived(db: DbClient, courseId: string, archived: boolean) {
  const { data, error } = await db
    .from("courses")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", courseId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Course not found.")
}

export async function saveUnit(db: DbClient, input: z.output<typeof unitSchema>) {
  const row = { title: input.title, description: input.description, session_count: input.sessionCount }
  const { error } = input.unitId
    ? await db.from("course_units").update(row).eq("id", input.unitId)
    : await db.from("course_units").insert({ ...row, course_id: input.courseId })
  if (error) throw fromPostgrestError(error)
}

export async function deleteUnit(db: DbClient, unitId: string) {
  const { error } = await db.from("course_units").delete().eq("id", unitId)
  if (error) throw fromPostgrestError(error)
}

export async function moveUnit(db: DbClient, unitId: string, direction: "up" | "down") {
  const { error } = await db.rpc("move_course_unit", { target_unit_id: unitId, direction })
  if (error) throw fromPostgrestError(error)
}
