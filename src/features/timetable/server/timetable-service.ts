import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

/**
 * Recurring timetable slots of planned/running classes. The view runs with
 * the caller's permissions, so teachers get their classes, students their
 * own, parents their children's, admins everything.
 */
export async function listTimetableEntries(db: DbClient, filters: { teacherId?: string; classId?: string } = {}) {
  let query = db
    .from("timetable_entries")
    .select(
      "slot_id, class_id, weekday, starts_at, ends_at, room, class_code, class_name, class_status, start_date, end_date, delivery_mode, meeting_url, course_name, subject_name, teacher_ids, lead_teacher_name"
    )
    .order("weekday")
    .order("starts_at")
  if (filters.teacherId) query = query.contains("teacher_ids", [filters.teacherId])
  if (filters.classId) query = query.eq("class_id", filters.classId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type TimetableEntry = Awaited<ReturnType<typeof listTimetableEntries>>[number]

/**
 * For parents: which of their children attend each class, so the timetable
 * can say whose lesson it is. RLS returns only the caller's children.
 */
export async function listChildrenByClass(db: DbClient) {
  const { data, error } = await db
    .from("students")
    .select("full_name, enrollments(class_id, status)")
    .is("deleted_at", null)
    .order("full_name")
  if (error) throw fromPostgrestError(error)

  const byClass: Record<string, string[]> = {}
  for (const student of data) {
    for (const enrollment of student.enrollments) {
      if (enrollment.status === "pending" || enrollment.status === "active") {
        ;(byClass[enrollment.class_id] ??= []).push(student.full_name)
      }
    }
  }
  return byClass
}
