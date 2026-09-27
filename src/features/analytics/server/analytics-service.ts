import "server-only"

import type { Range, Result, Source } from "@/features/analytics/metrics"
import { addCounts, attendanceRate, emptyCounts, type StatusCounts } from "@/features/attendance/summary"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// Every function runs as the caller: the database returns only results,
// attendance and homework the caller may read (see progress_results()).

type Filters = { studentId?: string; classId?: string }

export async function loadResults(db: DbClient, range: Range, f: Filters = {}): Promise<Result[]> {
  const { data, error } = await db.rpc("progress_results", {
    date_from: range.from,
    date_to: range.to,
    student_filter: f.studentId ?? null,
    class_filter: f.classId ?? null,
  })
  if (error) throw fromPostgrestError(error)
  return data.map((r) => ({
    studentId: r.student_id,
    classId: r.class_id,
    occurredOn: String(r.occurred_on).slice(0, 10),
    source: r.source as Source,
    skill: r.skill,
    itemId: r.item_id,
    title: r.title,
    rawScore: Number(r.raw_score),
    maxScore: Number(r.max_score),
    percent: r.percent === null ? null : Number(r.percent),
    band: r.band === null ? null : Number(r.band),
    assessedBy: r.assessed_by,
    assessor: r.assessor,
  }))
}

export async function loadHomework(db: DbClient, range: Range, f: Filters = {}) {
  const { data, error } = await db.rpc("homework_completion", {
    date_from: range.from,
    date_to: range.to,
    student_filter: f.studentId ?? null,
    class_filter: f.classId ?? null,
  })
  if (error) throw fromPostgrestError(error)
  return data.map((r) => ({ ...r, set_count: Number(r.set_count), handed_in: Number(r.handed_in), late: Number(r.late), missing: Number(r.missing), not_due: Number(r.not_due) }))
}

export async function loadVocabulary(db: DbClient, studentId: string) {
  const { data, error } = await db.rpc("vocabulary_mastery", { student_filter: studentId })
  if (error) throw fromPostgrestError(error)
  return data.map((r) => ({ box: Number(r.box), words: Number(r.words) }))
}

/** Attendance counts per student or class (and in total). */
export async function loadAttendance(db: DbClient, range: Range, groupBy: "student" | "class", f: Filters = {}) {
  const { data, error } = await db.rpc("attendance_summary", {
    date_from: range.from,
    date_to: range.to,
    group_by: groupBy,
    class_filter: f.classId ?? null,
    student_filter: f.studentId ?? null,
  })
  if (error) throw fromPostgrestError(error)
  const byGroup = new Map<string, StatusCounts>()
  let total = emptyCounts()
  for (const r of data) {
    const counts = { present: Number(r.present), late: Number(r.late), absent: Number(r.absent), excused: Number(r.excused) }
    byGroup.set(r.group_id, counts)
    total = addCounts(total, counts)
  }
  return { byGroup, total, rate: attendanceRate(total) }
}

export async function getStudentHeader(db: DbClient, id: string) {
  const { data, error } = await db
    .from("students")
    .select(
      `id, full_name, student_code, english_level_code, target_level_code,
       level:english_levels!students_english_level_code_fkey(name, cefr),
       target:english_levels!students_target_level_code_fkey(name, cefr),
       enrollments(status, class:classes(id, name, code))`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  return {
    ...data,
    classes: data.enrollments.filter((e) => e.status !== "withdrawn" && e.class).map((e) => e.class!),
  }
}

export async function listVisibleStudents(db: DbClient) {
  const { data, error } = await db.from("students").select("id, full_name, student_code, profile_id").is("deleted_at", null).order("full_name").limit(1000)
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listVisibleClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, name, code, status, enrollments(status, student:students(deleted_at))")
    .is("deleted_at", null)
    .in("status", ["planned", "active", "completed"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    status: c.status,
    students: c.enrollments.filter((e) => e.status !== "withdrawn" && e.status !== "pending" && e.student && !e.student.deleted_at).length,
  }))
}

export async function getClassHeader(db: DbClient, id: string) {
  const { data, error } = await db.from("classes").select("id, name, code, status, course:courses(name)").eq("id", id).is("deleted_at", null).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}
