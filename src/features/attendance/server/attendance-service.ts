import "server-only"

import type { SaveAttendanceOutput } from "@/features/attendance/schemas"
import {
  ABSENCE_WINDOW_DAYS,
  absenceAlertLevel,
  addCounts,
  attendanceRate,
  emptyCounts,
  weeklySeries,
} from "@/features/attendance/summary"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// Every query runs as the signed-in user: RLS decides which registers and
// records come back (a teacher's report only ever covers their classes).

/**
 * The register for one class and date: every student enrolled that day,
 * with their saved record if the register was already taken.
 */
export async function getRegister(db: DbClient, classId: string, date: string) {
  const [sessionResult, recordResult, rosterResult] = await Promise.all([
    db
      .from("attendance_sessions")
      .select("id, notes, recorded_by_name, updated_at")
      .eq("class_id", classId)
      .eq("session_date", date)
      .maybeSingle(),
    db
      .from("attendance_records")
      .select("student_id, status, attended_via, minutes_late, note, student:students(id, student_code, full_name)")
      .eq("class_id", classId)
      .eq("session_date", date),
    db
      .from("enrollments")
      .select("student:students(id, student_code, full_name)")
      .eq("class_id", classId)
      .neq("status", "pending")
      .lte("enrolled_on", date)
      .or(`ended_on.is.null,ended_on.gte.${date}`),
  ])
  if (sessionResult.error) throw fromPostgrestError(sessionResult.error)
  if (recordResult.error) throw fromPostgrestError(recordResult.error)
  if (rosterResult.error) throw fromPostgrestError(rosterResult.error)

  const students = new Map<string, { id: string; student_code: string; full_name: string }>()
  for (const { student } of [...rosterResult.data, ...recordResult.data]) if (student) students.set(student.id, student)
  const records = new Map(recordResult.data.map((r) => [r.student_id, r]))

  return {
    session: sessionResult.data,
    rows: [...students.values()]
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
      .map((student) => ({ student, record: records.get(student.id) ?? null })),
  }
}

/** Registers already taken for a class, newest first, with their counts. */
export async function listClassRegisters(db: DbClient, classId: string, limit = 60) {
  const { data, error } = await db
    .from("attendance_sessions")
    .select("id, session_date, notes, recorded_by_name, attendance_records(status)")
    .eq("class_id", classId)
    .order("session_date", { ascending: false })
    .limit(limit)
  if (error) throw fromPostgrestError(error)
  return data.map(({ attendance_records, ...session }) => {
    const counts = emptyCounts()
    for (const r of attendance_records) counts[r.status] += 1
    return { ...session, counts, rate: attendanceRate(counts) }
  })
}

export async function saveAttendance(db: DbClient, input: SaveAttendanceOutput) {
  const { data, error } = await db.rpc("save_attendance", {
    target_class_id: input.classId,
    target_date: input.date,
    session_notes: input.notes,
    entries: input.entries.map((e) => ({
      student_id: e.studentId,
      status: e.status,
      attended_via: e.attendedVia,
      minutes_late: e.status === "late" ? e.minutesLate : null,
      note: e.note,
    })),
  })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function deleteRegister(db: DbClient, sessionId: string) {
  const { data, error } = await db.from("attendance_sessions").delete().eq("id", sessionId).select("class_id, session_date")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Register not found, or you may not delete it.")
  return data[0]
}

/** Attendance records, newest first (history lists). */
export async function listAttendanceHistory(
  db: DbClient,
  filters: { from?: string; to?: string; studentId?: string; classId?: string; limit?: number } = {}
) {
  let query = db
    .from("attendance_records")
    .select(
      `id, session_date, status, attended_via, minutes_late, note, student_id, class_id,
       student:students(id, full_name, student_code),
       class:classes(id, name, code)`
    )
    .order("session_date", { ascending: false })
    .limit(filters.limit ?? 500)
  if (filters.from) query = query.gte("session_date", filters.from)
  if (filters.to) query = query.lte("session_date", filters.to)
  if (filters.studentId) query = query.eq("student_id", filters.studentId)
  if (filters.classId) query = query.eq("class_id", filters.classId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type AttendanceHistoryRow = Awaited<ReturnType<typeof listAttendanceHistory>>[number]

export type ReportGrouping = "student" | "class" | "teacher"

export type ReportFilters = {
  from: string
  to: string
  classId?: string
  teacherId?: string
  studentId?: string
}

function reportArgs(filters: ReportFilters) {
  return {
    date_from: filters.from,
    date_to: filters.to,
    class_filter: filters.classId ?? null,
    teacher_filter: filters.teacherId ?? null,
    student_filter: filters.studentId ?? null,
  }
}

async function summarize(db: DbClient, filters: ReportFilters, groupBy: ReportGrouping) {
  const { data, error } = await db.rpc("attendance_summary", { ...reportArgs(filters), group_by: groupBy })
  if (error) throw fromPostgrestError(error)
  return data.map((row) => {
    const counts = addCounts(emptyCounts(), row)
    return { id: row.group_id, label: row.label, code: row.code, sessions: Number(row.sessions), ...counts, total: Number(row.total), rate: attendanceRate(counts) }
  })
}

export type ReportRow = Awaited<ReturnType<typeof summarize>>[number]

/** Everything the attendance dashboard needs for one set of filters. */
export async function loadAttendanceReport(db: DbClient, filters: ReportFilters, groupBy: ReportGrouping) {
  const [rows, byClass, trendResult] = await Promise.all([
    summarize(db, filters, groupBy),
    groupBy === "class" ? null : summarize(db, filters, "class"),
    db.rpc("attendance_trend", reportArgs(filters)),
  ])
  if (trendResult.error) throw fromPostgrestError(trendResult.error)

  // Each record appears once in the trend, so totals come from there; each
  // register belongs to one class, so sessions come from the per-class rows.
  const totals = trendResult.data.reduce((sum, week) => addCounts(sum, week), emptyCounts())
  const sessions = (byClass ?? rows).reduce((sum, row) => sum + row.sessions, 0)

  return {
    rows,
    totals: { ...totals, sessions, rate: attendanceRate(totals) },
    weekly: weeklySeries(
      trendResult.data.map((w) => ({ ...w, week_start: w.week_start.slice(0, 10) })),
      filters.from,
      filters.to
    ),
  }
}

/** Students whose recent absences need attention, most serious first. */
export async function loadAbsenceAlerts(db: DbClient, filters: { classId?: string; studentId?: string } = {}) {
  const { data, error } = await db.rpc("attendance_alerts", {
    class_filter: filters.classId ?? null,
    student_filter: filters.studentId ?? null,
    window_days: ABSENCE_WINDOW_DAYS,
  })
  if (error) throw fromPostgrestError(error)
  return data
    .map((row) => {
      const pattern = { consecutive: Number(row.consecutive_absences), recent: Number(row.recent_absences) }
      return { ...row, ...pattern, level: absenceAlertLevel(pattern) }
    })
    .filter((row): row is typeof row & { level: NonNullable<typeof row.level> } => row.level !== null)
    .sort((a, b) => Number(b.level === "serious") - Number(a.level === "serious") || b.consecutive - a.consecutive || b.recent - a.recent)
}

export type AbsenceAlert = Awaited<ReturnType<typeof loadAbsenceAlerts>>[number]

/** Classes and teachers for the report filters (only those the caller can see). */
export async function listReportFilterOptions(db: DbClient, withTeachers: boolean) {
  const [classResult, teacherResult] = await Promise.all([
    db
      .from("classes")
      .select("id, name, status, class_members(teacher_id)")
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("name"),
    withTeachers
      ? db.from("teachers").select("id, full_name").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [], error: null }),
  ])
  if (classResult.error) throw fromPostgrestError(classResult.error)
  if (teacherResult.error) throw fromPostgrestError(teacherResult.error)
  return { classes: classResult.data, teachers: teacherResult.data }
}

/** Classes the caller can take attendance for (RLS: a teacher's own classes). */
export async function listRegisterClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, code, name, status, delivery_mode, start_date, end_date, class_schedule_slots(weekday)")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}
