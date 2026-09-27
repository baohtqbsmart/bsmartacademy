import "server-only"

import { parseRange, summarize } from "@/features/analytics/metrics"
import { loadResults } from "@/features/analytics/server/analytics-service"
import { attendanceRate, type StatusCounts } from "@/features/attendance/summary"
import { addDays, todayInAcademy } from "@/lib/dates"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// The parent portal only reads. Every query runs as the parent: RLS returns
// their own children's rows and nothing else (tests/db/communication.test.ts
// checks the parent cannot reach another family's data).

export async function listChildren(db: DbClient) {
  const { data, error } = await db.from("students").select("id, full_name, student_code").is("deleted_at", null).order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

function check<T>(r: { data: T | null; error: Parameters<typeof fromPostgrestError>[0] | null }): T {
  if (r.error) throw fromPostgrestError(r.error)
  return r.data as T
}

export async function getChildOverview(db: DbClient, studentId: string) {
  const today = todayInAcademy()
  const monthAgo = addDays(today, -29)
  const nowIso = new Date().toISOString()

  const [student, enrollments] = await Promise.all([
    db
      .from("students")
      .select(
        `id, full_name, student_code, date_of_birth, school_name, status,
         level:english_levels!students_english_level_code_fkey(name, cefr),
         target:english_levels!students_target_level_code_fkey(name, cefr)`
      )
      .eq("id", studentId)
      .is("deleted_at", null)
      .maybeSingle(),
    db
      .from("enrollments")
      .select(
        `status, enrolled_on, class:classes(id, name, code, status, delivery_mode, start_date, end_date, deleted_at, course:courses(name),
          class_members(member_role, teacher:teachers(id, full_name)),
          class_schedule_slots(weekday, starts_at, ends_at, room))`
      )
      .eq("student_id", studentId)
      .in("status", ["active", "pending"]),
  ])
  const s = check(student)
  if (!s) return null
  const classes = check(enrollments)
    .flatMap((e) => (e.class && !e.class.deleted_at ? [{ ...e.class, enrollmentStatus: e.status }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  const classIds = classes.map((c) => c.id)
  const none = ["00000000-0000-0000-0000-000000000000"]

  const [online, attendance, assignments, grades, tests, feedback, assessmentFeedback, invoices, payments, progress] = await Promise.all([
    db
      .from("online_sessions")
      .select("id, title, starts_at, ends_at, status, class:classes(name)")
      .in("class_id", classIds.length ? classIds : none)
      .gte("ends_at", nowIso)
      .lte("starts_at", new Date(Date.now() + 14 * 86_400_000).toISOString())
      .order("starts_at")
      .limit(6),
    db
      .from("attendance_records")
      .select("id, status, session_date, minutes_late, class:classes(name)")
      .eq("student_id", studentId)
      .gte("session_date", monthAgo)
      .order("session_date", { ascending: false }),
    db
      .from("assignments")
      .select("id, title, due_at, status, class:classes(name), submissions(student_id, status, is_late, submitted_at)")
      .in("class_id", classIds.length ? classIds : none)
      .not("due_at", "is", null)
      .gte("due_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .lte("due_at", new Date(Date.now() + 14 * 86_400_000).toISOString())
      .is("archived_at", null)
      .order("due_at"),
    db
      .from("submission_grades")
      .select("submission_id, score, feedback, graded_by_name, returned_at, submission:submissions!inner(student_id, assignment:assignments(id, title, max_score))")
      .eq("submission.student_id", studentId)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false })
      .limit(8),
    db
      .from("test_attempts")
      .select("id, score, status, submitted_at, graded_at, attempt_number, test:tests(id, title, total_score)")
      .eq("student_id", studentId)
      .eq("status", "graded")
      .order("graded_at", { ascending: false })
      .limit(8),
    db.from("student_feedback").select("id, body, author_name, created_at").eq("student_id", studentId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    db
      .from("assessment_grades")
      .select("submission_id, feedback, graded_by_name, returned_at, total_score, submission:assessment_submissions!inner(student_id, task:assessment_tasks(title, scoring, max_score))")
      .eq("submission.student_id", studentId)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false })
      .limit(5),
    db
      .from("invoice_balances")
      .select("id, invoice_number, description, amount, paid, remaining, due_date, payment_status")
      .eq("student_id", studentId)
      .neq("payment_status", "void")
      .order("due_date", { ascending: false })
      .limit(6),
    db.from("payments").select("id, receipt_number, amount, paid_on, method, status").eq("student_id", studentId).order("paid_on", { ascending: false }).limit(8),
    loadResults(db, parseRange(undefined, undefined, today), { studentId }),
  ])

  const records = check(attendance)
  const counts: StatusCounts = { present: 0, late: 0, absent: 0, excused: 0 }
  for (const r of records) counts[r.status] += 1

  return {
    student: s,
    classes,
    online: check(online),
    attendance: { counts, rate: attendanceRate(counts), recentAbsences: records.filter((r) => r.status === "absent" || r.status === "late").slice(0, 5), from: monthAgo },
    homework: check(assignments).map((a) => {
      const sub = a.submissions.find((x) => x.student_id === studentId && x.status !== "in_progress")
      const due = a.due_at ? Date.parse(a.due_at) : 0
      return { ...a, handedIn: Boolean(sub), late: sub?.is_late ?? false, overdue: !sub && due < Date.now() }
    }),
    grades: check(grades),
    tests: check(tests),
    feedback: check(feedback),
    assessmentFeedback: check(assessmentFeedback),
    invoices: check(invoices),
    payments: check(payments),
    progress: summarize(progress),
  }
}

export type ChildOverview = NonNullable<Awaited<ReturnType<typeof getChildOverview>>>
