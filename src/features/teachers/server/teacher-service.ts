import "server-only"

import type { z } from "zod"

import type { qualificationSchema, TeacherFormOutput } from "@/features/teachers/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

const CURRENT_CLASS = new Set(["planned", "active"])

/**
 * Teachers visible to the caller (RLS). The staff list is small, so search
 * and filters run here, accent-insensitively.
 */
export async function listTeachers(
  db: DbClient,
  filters: { q?: string; status?: Enums<"staff_status">; subjectId?: string; archived?: boolean }
) {
  let query = db
    .from("teachers")
    .select(
      `id, teacher_code, full_name, email, phone, status, deleted_at,
       teacher_subjects(subject:subjects(id, name)),
       class_members(class:classes(id, status, deleted_at))`
    )
    .order("full_name")
  query = filters.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (filters.status) query = query.eq("status", filters.status)

  const { data, error } = await query
  if (error) throw fromPostgrestError(error)

  const term = normalizeSearch(filters.q ?? "")
  return data
    .filter((t) => !term || normalizeSearch(`${t.full_name} ${t.teacher_code} ${t.email ?? ""}`).includes(term))
    .filter((t) => !filters.subjectId || t.teacher_subjects.some((ts) => ts.subject?.id === filters.subjectId))
    .map((t) => ({
      ...t,
      subjects: t.teacher_subjects.flatMap((ts) => (ts.subject ? [ts.subject.name] : [])),
      currentClassCount: t.class_members.filter(
        (m) => m.class && !m.class.deleted_at && CURRENT_CLASS.has(m.class.status)
      ).length,
    }))
}

export async function getTeacher(db: DbClient, teacherId: string) {
  const { data, error } = await db
    .from("teachers")
    .select(
      `id, teacher_code, full_name, email, phone, hired_on, status, profile_id, deleted_at,
       teacher_subjects(subject:subjects(id, code, name)),
       teacher_qualifications(id, title, institution, year_awarded),
       class_members(member_role, class:classes(id, code, name, status, start_date, end_date, deleted_at, course:courses(name)))`
    )
    .eq("id", teacherId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null

  const notes = await db.rpc("teacher_notes", { target_teacher_id: teacherId })
  if (notes.error) throw fromPostgrestError(notes.error)
  return { ...data, notes: notes.data }
}

export type TeacherDetail = NonNullable<Awaited<ReturnType<typeof getTeacher>>>

/** Active teachers, for class assignment pickers. */
export async function listAssignableTeachers(db: DbClient) {
  const { data, error } = await db
    .from("teachers")
    .select("id, teacher_code, full_name")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

function toRow(input: TeacherFormOutput) {
  return {
    teacher_code: input.teacherCode,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    hired_on: input.hiredOn,
    status: input.status,
    notes: input.notes,
  }
}

export async function createTeacher(db: DbClient, input: TeacherFormOutput) {
  const { data, error } = await db.from("teachers").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateTeacher(db: DbClient, teacherId: string, input: TeacherFormOutput) {
  const { data, error } = await db.from("teachers").update(toRow(input)).eq("id", teacherId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Teacher not found.")
}

export async function setTeacherArchived(db: DbClient, teacherId: string, archived: boolean) {
  const { data, error } = await db
    .from("teachers")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", teacherId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Teacher not found.")
}

/** Replaces the teacher's subjects with exactly `subjectIds`. */
export async function setTeacherSubjects(db: DbClient, teacherId: string, subjectIds: string[]) {
  const remove = db.from("teacher_subjects").delete().eq("teacher_id", teacherId)
  const { error: removeError } =
    subjectIds.length > 0 ? await remove.not("subject_id", "in", `(${subjectIds.join(",")})`) : await remove
  if (removeError) throw fromPostgrestError(removeError)

  if (subjectIds.length > 0) {
    const { error } = await db
      .from("teacher_subjects")
      .upsert(subjectIds.map((subject_id) => ({ teacher_id: teacherId, subject_id })), { ignoreDuplicates: true })
    if (error) throw fromPostgrestError(error)
  }
}

export async function addQualification(db: DbClient, input: z.output<typeof qualificationSchema>) {
  const { error } = await db.from("teacher_qualifications").insert({
    teacher_id: input.teacherId,
    title: input.title,
    institution: input.institution,
    year_awarded: input.yearAwarded,
  })
  if (error) throw fromPostgrestError(error)
}

export async function removeQualification(db: DbClient, qualificationId: string) {
  const { error } = await db.from("teacher_qualifications").delete().eq("id", qualificationId)
  if (error) throw fromPostgrestError(error)
}
