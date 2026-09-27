import "server-only"

import { groupSummary, homeworkSummary, parseRange } from "@/features/analytics/metrics"
import { loadHomework, loadResults } from "@/features/analytics/server/analytics-service"
import { attendanceRate } from "@/features/attendance/summary"
import { addDays, todayInAcademy } from "@/lib/dates"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// Live figures for the admin dashboard. Every number comes from a query here;
// nothing is stored or hard-coded. Queries run as the caller (RLS applies).

const countBy = <T extends string>(rows: { status: T }[]) => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})

export async function loadDashboard(db: DbClient, opts: { withTuition: boolean }) {
  const today = todayInAcademy()
  const month = parseRange(addDays(today, -29), today, today)
  const quarter = parseRange(undefined, undefined, today)
  const trendRange = { from: addDays(today, -83), to: today }
  const since30 = `${month.from}T00:00:00+07:00`

  const [students, teachers, classes, courses, newEnrolments, attendance, trend, published, awaiting, homework, results] = await Promise.all([
    db.from("students").select("status").is("deleted_at", null),
    db.from("teachers").select("status").is("deleted_at", null),
    db.from("classes").select("status").is("deleted_at", null),
    db.from("courses").select("status").is("deleted_at", null),
    db.from("enrollments").select("id", { count: "exact", head: true }).gte("enrolled_on", month.from).neq("status", "withdrawn"),
    db.rpc("attendance_summary", { date_from: month.from, date_to: month.to, group_by: "class" }),
    db.rpc("attendance_trend", { date_from: trendRange.from, date_to: trendRange.to }),
    db.from("assignments").select("id", { count: "exact", head: true }).gte("published_at", since30),
    db.from("submissions").select("id, submission_grades(submission_id)").eq("status", "submitted"),
    loadHomework(db, month),
    loadResults(db, quarter),
  ])
  for (const r of [students, teachers, classes, courses, newEnrolments, attendance, trend, published, awaiting]) if (r.error) throw fromPostgrestError(r.error)

  const totals = (attendance.data ?? []).reduce(
    (acc, r) => ({ present: acc.present + Number(r.present), late: acc.late + Number(r.late), absent: acc.absent + Number(r.absent), excused: acc.excused + Number(r.excused) }),
    { present: 0, late: 0, absent: 0, excused: 0 }
  )

  let tuition = null
  if (opts.withTuition) {
    const monthStart = `${today.slice(0, 7)}-01`
    const [open, payments] = await Promise.all([
      db.from("invoice_balances").select("remaining, payment_status").in("payment_status", ["unpaid", "partially_paid", "overdue"]),
      db.from("payments").select("amount").eq("status", "completed").gte("paid_on", monthStart).lte("paid_on", today),
    ])
    if (open.error) throw fromPostgrestError(open.error)
    if (payments.error) throw fromPostgrestError(payments.error)
    const overdue = open.data.filter((i) => i.payment_status === "overdue")
    tuition = {
      outstanding: open.data.reduce((a, i) => a + Number(i.remaining), 0),
      openInvoices: open.data.length,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((a, i) => a + Number(i.remaining), 0),
      collectedThisMonth: payments.data.reduce((a, p) => a + Number(p.amount), 0),
    }
  }

  return {
    month,
    quarter,
    students: countBy(students.data ?? []),
    teachers: countBy(teachers.data ?? []),
    classes: countBy(classes.data ?? []),
    courses: countBy(courses.data ?? []),
    newEnrolments: newEnrolments.count ?? 0,
    attendance: { ...totals, rate: attendanceRate(totals) },
    trend: (trend.data ?? []).map((w) => {
      const c = { present: Number(w.present), late: Number(w.late), absent: Number(w.absent), excused: Number(w.excused) }
      const rate = attendanceRate(c)
      return { label: String(w.week_start).slice(5, 10).split("-").reverse().join("/"), rate: rate === null ? null : Math.round(rate * 100), ...c }
    }),
    assignments: {
      published: published.count ?? 0,
      awaitingMarking: (awaiting.data ?? []).filter((s) => !s.submission_grades).length,
      homework: homeworkSummary(homework),
    },
    performance: groupSummary(results),
    tuition,
  }
}
