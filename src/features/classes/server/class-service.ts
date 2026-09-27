import "server-only"

import type { z } from "zod"

import type { ClassFormOutput, slotSchema } from "@/features/classes/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

export type ClassStatusFilter = "current" | "all" | Enums<"class_status">

const CURRENT = new Set(["planned", "active"])
const SEATED = new Set(["pending", "active"])

/** Classes visible to the caller (RLS), filtered here (small set). */
export async function listClasses(
  db: DbClient,
  filters: { q?: string; status?: ClassStatusFilter; courseId?: string; teacherId?: string; archived?: boolean } = {}
) {
  let query = db
    .from("classes")
    .select(
      `id, code, name, status, start_date, end_date, room, delivery_mode, capacity, deleted_at,
       course:courses(id, name, subject:subjects(id, name, icon, image_path), level:levels(name)),
       class_members(member_role, teacher:teachers(id, full_name)),
       class_schedule_slots(id, weekday, starts_at, ends_at, room),
       enrollments(status)`
    )
    .order("start_date", { ascending: false, nullsFirst: false })
  query = filters.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  const status = filters.status ?? "current"
  if (status === "current") query = query.in("status", ["planned", "active"])
  else if (status !== "all") query = query.eq("status", status)
  if (filters.courseId) query = query.eq("course_id", filters.courseId)

  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const term = normalizeSearch(filters.q ?? "")
  return data
    .filter((c) => !term || normalizeSearch(`${c.name} ${c.code} ${c.course?.name ?? ""}`).includes(term))
    .filter((c) => !filters.teacherId || c.class_members.some((m) => m.teacher?.id === filters.teacherId))
    .map((c) => ({ ...c, studentCount: c.enrollments.filter((e) => SEATED.has(e.status)).length }))
}

export async function getClass(db: DbClient, classId: string) {
  const { data, error } = await db
    .from("classes")
    .select(
      `id, code, name, status, course_id, start_date, end_date, capacity, room, delivery_mode, meeting_url, deleted_at,
       course:courses(id, code, name, subject:subjects(id, name), level:levels(id, name)),
       class_members(member_role, assigned_on, teacher:teachers(id, teacher_code, full_name, status)),
       class_schedule_slots(id, weekday, starts_at, ends_at, room),
       enrollments(id, status, enrolled_on, ended_on, student:students(id, student_code, full_name))`
    )
    .eq("id", classId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export type ClassDetail = NonNullable<Awaited<ReturnType<typeof getClass>>>

/** Planned and running classes, for enrolment and transfer pickers. */
export async function listOpenClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, code, name, status")
    .is("deleted_at", null)
    .in("status", ["planned", "active"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

/** Active students, for "add student to class". */
export async function listEnrollableStudents(db: DbClient) {
  const { data, error } = await db
    .from("students")
    .select("id, student_code, full_name")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

function toRow(input: ClassFormOutput) {
  return {
    code: input.code,
    name: input.name,
    course_id: input.courseId,
    status: input.status,
    start_date: input.startDate,
    end_date: input.endDate,
    capacity: input.capacity,
    delivery_mode: input.deliveryMode,
    room: input.room,
    meeting_url: input.meetingUrl,
  }
}

export async function createClass(db: DbClient, input: ClassFormOutput) {
  const { data, error } = await db.from("classes").insert(toRow(input)).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function updateClass(db: DbClient, classId: string, input: ClassFormOutput) {
  const { data, error } = await db.from("classes").update(toRow(input)).eq("id", classId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Class not found.")
}

export async function setClassArchived(db: DbClient, classId: string, archived: boolean) {
  const { data, error } = await db
    .from("classes")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", classId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Class not found.")
}

// Lead uniqueness and timetable clashes are enforced by the database.
export async function assignTeacher(
  db: DbClient,
  input: { classId: string; teacherId: string; role: Enums<"class_member_role"> }
) {
  const { error } = await db.rpc("assign_class_teacher", {
    target_class_id: input.classId,
    target_teacher_id: input.teacherId,
    new_role: input.role,
  })
  if (error) throw fromPostgrestError(error)
}

export async function removeTeacher(db: DbClient, classId: string, teacherId: string) {
  const { error } = await db.from("class_members").delete().eq("class_id", classId).eq("teacher_id", teacherId)
  if (error) throw fromPostgrestError(error)
}

export async function saveSlot(db: DbClient, input: z.output<typeof slotSchema>) {
  const row = { weekday: input.weekday, starts_at: input.startsAt, ends_at: input.endsAt, room: input.room }
  const { error } = input.slotId
    ? await db.from("class_schedule_slots").update(row).eq("id", input.slotId)
    : await db.from("class_schedule_slots").insert({ ...row, class_id: input.classId })
  if (error) throw fromPostgrestError(error)
}

export async function deleteSlot(db: DbClient, slotId: string) {
  const { error } = await db.from("class_schedule_slots").delete().eq("id", slotId)
  if (error) throw fromPostgrestError(error)
}

export function isCurrentClass(status: string) {
  return CURRENT.has(status)
}
