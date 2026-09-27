import "server-only"

import {
  STUDENT_PAGE_SIZE,
  type StudentListQuery,
  type StudentSort,
} from "@/features/students/list-query"
import type { StudentFormOutput } from "@/features/students/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { escapeLike, normalizeSearch } from "@/lib/search"
import { studentPhotoPath } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums, TablesInsert } from "@/types/database"

const SORT_COLUMNS: Record<StudentSort, "full_name" | "student_code" | "joined_on" | "created_at"> = {
  name: "full_name",
  code: "student_code",
  joined: "joined_on",
  created: "created_at",
}

/**
 * One page of the student directory. Search, filters, sorting and paging all
 * run in Postgres; RLS limits the rows to what the caller may see.
 */
export async function listStudentDirectory(
  db: DbClient,
  query: StudentListQuery,
  options: { includeArchived: boolean }
) {
  let request = db
    .from("student_directory")
    .select(
      "id, student_code, full_name, phone, status, joined_on, english_level_code, current_class_names, primary_parent_name, deleted_at",
      { count: "exact" }
    )

  request =
    options.includeArchived && query.archived
      ? request.not("deleted_at", "is", null)
      : request.is("deleted_at", null)

  const term = normalizeSearch(query.q)
  if (term) request = request.ilike("search_text", `%${escapeLike(term)}%`)
  if (query.status) request = request.eq("status", query.status)
  if (query.level) request = request.eq("english_level_code", query.level)
  if (query.class) request = request.contains("current_class_ids", [query.class])

  const from = (query.page - 1) * STUDENT_PAGE_SIZE
  const { data, count, error } = await request
    .order(SORT_COLUMNS[query.sort], { ascending: query.dir === "asc", nullsFirst: false })
    .order("id")
    .range(from, from + STUDENT_PAGE_SIZE - 1)

  // Requesting a page past the end is not an error; show an empty page.
  if (error?.code === "PGRST103") return { rows: [], total: 0 }
  if (error) throw fromPostgrestError(error)
  return { rows: data, total: count ?? 0 }
}

export async function listEnglishLevels(db: DbClient) {
  const { data, error } = await db
    .from("english_levels")
    .select("code, framework, name, cefr")
    .order("sort_order")
  if (error) throw fromPostgrestError(error)
  return data
}

/** Full profile, or null when the student does not exist or is not visible. */
export async function getStudentProfile(db: DbClient, studentId: string) {
  const { data, error } = await db
    .from("students")
    .select(
      `id, student_code, full_name, date_of_birth, gender, phone, email, address, school_name,
       status, joined_on, avatar_path, profile_id, deleted_at, created_at,
       english_level_code, target_level_code,
       english_level:english_levels!students_english_level_code_fkey(name, cefr),
       target_level:english_levels!students_target_level_code_fkey(name, cefr),
       student_parents(relationship, is_primary_contact, parent:parents(id, full_name, phone, email)),
       enrollments(id, status, enrolled_on, ended_on,
         class:classes(id, code, name, status, start_date, end_date, course:courses(name)))`
    )
    .eq("id", studentId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null

  // Internal notes are served only to staff (admins and the student's teachers).
  const notes = await db.rpc("student_notes", { target_student_id: studentId })
  if (notes.error) throw fromPostgrestError(notes.error)
  return { ...data, notes: notes.data }
}

export type StudentProfile = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>

/** The student record linked to the signed-in account, if any. */
export async function getOwnStudentId(db: DbClient, profileId: string) {
  const { data, error } = await db
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data?.id ?? null
}

function toRow(input: StudentFormOutput) {
  return {
    full_name: input.fullName,
    date_of_birth: input.dateOfBirth,
    gender: input.gender,
    phone: input.phone,
    email: input.email,
    address: input.address,
    school_name: input.schoolName,
    joined_on: input.joinedOn,
    english_level_code: input.englishLevelCode,
    target_level_code: input.targetLevelCode,
    status: input.status,
    notes: input.notes,
  } satisfies TablesInsert<"students">
}

export async function createStudent(db: DbClient, input: StudentFormOutput) {
  const { data, error } = await db.from("students").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateStudent(db: DbClient, studentId: string, input: StudentFormOutput) {
  const { data, error } = await db.from("students").update(toRow(input)).eq("id", studentId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Student not found.")
}

export async function setStudentArchived(db: DbClient, studentId: string, archived: boolean) {
  const { data, error } = await db
    .from("students")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", studentId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Student not found.")
}

export async function markStudentPhotoUploaded(db: DbClient, studentId: string) {
  const { data, error } = await db
    .from("students")
    .update({ avatar_path: studentPhotoPath(studentId) })
    .eq("id", studentId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Student not found.")
}

export async function linkParent(
  db: DbClient,
  link: {
    studentId: string
    parentId: string
    relationship: Enums<"guardian_relationship">
    isPrimaryContact: boolean
  }
) {
  // Only one primary contact per student (enforced by a unique index).
  if (link.isPrimaryContact) {
    const { error } = await db
      .from("student_parents")
      .update({ is_primary_contact: false })
      .eq("student_id", link.studentId)
      .neq("parent_id", link.parentId)
    if (error) throw fromPostgrestError(error)
  }
  const { error } = await db.from("student_parents").upsert({
    student_id: link.studentId,
    parent_id: link.parentId,
    relationship: link.relationship,
    is_primary_contact: link.isPrimaryContact,
  })
  if (error) throw fromPostgrestError(error)
}

export async function unlinkParent(db: DbClient, studentId: string, parentId: string) {
  const { error } = await db.from("student_parents").delete().eq("student_id", studentId).eq("parent_id", parentId)
  if (error) throw fromPostgrestError(error)
}
