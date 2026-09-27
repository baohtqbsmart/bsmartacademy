import "server-only"

import { skillSummaries, summarize, type Range } from "@/features/analytics/metrics"
import { loadAttendance, loadResults } from "@/features/analytics/server/analytics-service"
import { listStudentAssignments } from "@/features/assignments/server/assignment-service"
import { listClasses } from "@/features/classes/server/class-service"
import { listNotifications } from "@/features/communication/server/communication-service"
import { listSessions } from "@/features/online/server/session-service"
import { listTimetableEntries } from "@/features/timetable/server/timetable-service"
import { addDays, isoWeekday, isWithin, todayInAcademy } from "@/lib/dates"
import type { DbClient } from "@/lib/supabase/types"

const OPEN = new Set(["not_started", "in_progress"])
const RESULTS_DAYS = 90
const ATTENDANCE_DAYS = 30

/**
 * Everything on a student's home screen, read with the student's own session:
 * RLS limits every query to their classes, work and results.
 */
export async function loadStudentDashboard(db: DbClient, studentId: string, now: Date = new Date()) {
  const today = todayInAcademy(now)
  const results: Range = { from: addDays(today, 1 - RESULTS_DAYS), to: today, days: RESULTS_DAYS }
  const attendanceRange: Range = { from: addDays(today, 1 - ATTENDANCE_DAYS), to: today, days: ATTENDANCE_DAYS }

  const [classes, work, scored, attendance, slots, sessions, notifications] = await Promise.all([
    listClasses(db, { status: "current" }),
    listStudentAssignments(db, "family", studentId),
    loadResults(db, results, { studentId }),
    loadAttendance(db, attendanceRange, "student", { studentId }),
    listTimetableEntries(db),
    listSessions(db, { from: today, to: today }),
    listNotifications(db, { unreadOnly: false, limit: 5 }),
  ])

  const open = work
    .filter((row) => OPEN.has(row.status) && (!row.assignment.due_at || new Date(row.assignment.due_at) >= now))
    .sort((a, b) => (a.assignment.due_at ?? "9999").localeCompare(b.assignment.due_at ?? "9999"))

  const weekday = isoWeekday(today)
  const todaySlots = slots
    .filter((s) => s.weekday === weekday && isWithin(today, s.start_date, s.end_date))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const todaySessions = sessions.filter((s) => s.status !== "cancelled")

  return {
    today,
    classes,
    open,
    overall: summarize(scored),
    skills: skillSummaries(scored),
    attendanceRate: attendance.rate,
    todaySlots,
    todaySessions,
    notifications,
    resultsDays: RESULTS_DAYS,
    attendanceDays: ATTENDANCE_DAYS,
  }
}

export type StudentDashboard = Awaited<ReturnType<typeof loadStudentDashboard>>

/** Share of a class's calendar already behind it (by dates, not by marks). */
export function courseProgress(start: string | null, end: string | null, today: string) {
  if (!start || !end || end <= start) return null
  if (today <= start) return 0
  if (today >= end) return 100
  const span = Date.parse(end) - Date.parse(start)
  return Math.round(((Date.parse(today) - Date.parse(start)) / span) * 100)
}
