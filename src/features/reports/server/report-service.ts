import "server-only"

import { groupSummary, homeworkSummary, previousRange, summarize, type Range, type Result } from "@/features/analytics/metrics"
import { loadHomework, loadResults } from "@/features/analytics/server/analytics-service"
import { attendanceRate, type StatusCounts } from "@/features/attendance/summary"
import type { Column, ReportKey, Row } from "@/features/reports/catalog"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// Every query runs as the caller, so RLS decides what a report can contain:
// administrators see the academy, teachers their own classes and students.

export type ReportFilters = Range & { classId?: string; teacherId?: string; courseId?: string; levelId?: string; studentId?: string }

export type ReportResult = {
  columns: Column[]
  rows: Row[]
  /** Headline figures above the table. */
  totals: { label: string; value: string }[]
  notes: string[]
  chart?: { title: string; kind: "attendance" | "money"; data: { label: string; value: number | null; detail?: string }[] }
}

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10)
const none = ["00000000-0000-0000-0000-000000000000"]
const ids = (list: string[]) => (list.length ? list : none)

// ---------------------------------------------------------------------------
// Scope: the classes (and students) the filters select, as the caller sees them
// ---------------------------------------------------------------------------

async function loadScope(db: DbClient, f: ReportFilters) {
  let query = db
    .from("classes")
    .select(
      `id, code, name, status, start_date, end_date, course:courses!inner(id, name, level_id, level:levels(id, name)),
       class_members(member_role, teacher:teachers(id, full_name)),
       enrollments(student_id, status, enrolled_on, ended_on, student:students(id, full_name, student_code, status, english_level_code, deleted_at))`
    )
    .is("deleted_at", null)
    .order("name")
  if (f.classId) query = query.eq("id", f.classId)
  if (f.courseId) query = query.eq("course_id", f.courseId)
  if (f.levelId) query = query.eq("course.level_id", f.levelId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const classes = data
    .filter((c) => !f.teacherId || c.class_members.some((m) => m.teacher?.id === f.teacherId))
    // Classes that did not run in the period are left out.
    .filter((c) => (!c.start_date || c.start_date <= f.to) && (!c.end_date || c.end_date >= f.from))
  const students = new Map<string, { id: string; full_name: string; student_code: string; status: string; english_level_code: string | null; classes: string[] }>()
  for (const c of classes)
    for (const e of c.enrollments) {
      if (!e.student || e.student.deleted_at || e.status === "pending") continue
      // Enrolled at some point during the period.
      if (e.enrolled_on > f.to || (e.ended_on && e.ended_on < f.from)) continue
      if (f.studentId && e.student.id !== f.studentId) continue
      const s = students.get(e.student.id) ?? { ...e.student, classes: [] }
      s.classes.push(c.name)
      students.set(e.student.id, s)
    }
  return { classes, students: [...students.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "vi")) }
}

type Scope = Awaited<ReturnType<typeof loadScope>>

async function attendanceBy(db: DbClient, f: ReportFilters, groupBy: "student" | "class" | "teacher") {
  const { data, error } = await db.rpc("attendance_summary", {
    date_from: f.from,
    date_to: f.to,
    group_by: groupBy,
    class_filter: f.classId ?? null,
    teacher_filter: f.teacherId ?? null,
    student_filter: f.studentId ?? null,
  })
  if (error) throw fromPostgrestError(error)
  return new Map(
    data.map((r) => {
      const counts: StatusCounts = { present: Number(r.present), late: Number(r.late), absent: Number(r.absent), excused: Number(r.excused) }
      return [r.group_id, { sessions: Number(r.sessions), counts, rate: attendanceRate(counts) }]
    })
  )
}

async function resultsInScope(db: DbClient, range: Range, scope: Scope, f: ReportFilters) {
  const all = await loadResults(db, range, { studentId: f.studentId, classId: f.classId })
  const classIds = new Set(scope.classes.map((c) => c.id))
  const studentIds = new Set(scope.students.map((s) => s.id))
  // Class work of the scoped classes, and the scoped students' own practice.
  return all.filter((r) => (r.classId ? classIds.has(r.classId) : studentIds.has(r.studentId)) && studentIds.has(r.studentId))
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

async function studentsReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const [attendance, homework, results] = await Promise.all([
    attendanceBy(db, f, "student"),
    loadHomework(db, f, { studentId: f.studentId, classId: f.classId }),
    resultsInScope(db, f, scope, f),
  ])
  const classIds = new Set(scope.classes.map((c) => c.id))
  const rows = scope.students.map((s) => {
    const own = results.filter((r) => r.studentId === s.id)
    const summary = summarize(own)
    const hw = homeworkSummary(homework.filter((h) => h.student_id === s.id && classIds.has(h.class_id)))
    const att = attendance.get(s.id)
    return {
      code: s.student_code,
      name: s.full_name,
      status: s.status,
      level: s.english_level_code,
      classes: s.classes.join("; "),
      attendance: pct(att?.rate ?? null),
      homework: pct(hw.completionRate),
      missing: hw.missing,
      results: summary.scored,
      average: summary.averagePercent,
    }
  })
  return {
    columns: [
      { key: "code", label: "Code", kind: "text" },
      { key: "name", label: "Student", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "level", label: "English level (recorded)", kind: "text" },
      { key: "classes", label: "Classes", kind: "text" },
      { key: "attendance", label: "Attendance %", kind: "percent" },
      { key: "homework", label: "Homework handed in %", kind: "percent" },
      { key: "missing", label: "Homework missing", kind: "number" },
      { key: "results", label: "Scored results", kind: "number" },
      { key: "average", label: "Average %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Students", value: String(rows.length) },
      { label: "With results", value: String(rows.filter((r) => r.results > 0).length) },
    ],
    notes: ["Attendance counts present and late as attended; excused sessions are not counted.", "Average % is the mean of published result percentages (IELTS-style bands excluded)."],
  }
}

async function classesReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const [attendance, homework, results] = await Promise.all([attendanceBy(db, f, "class"), loadHomework(db, f, { classId: f.classId }), resultsInScope(db, f, scope, f)])
  let withheld = 0
  const rows = scope.classes.map((c) => {
    const active = c.enrollments.filter((e) => e.status === "active" && e.student && !e.student.deleted_at).length
    const g = groupSummary(results.filter((r) => r.classId === c.id))
    if (g.suppressed && g.studentsWithResults > 0) withheld += 1
    const att = attendance.get(c.id)
    return {
      code: c.code,
      name: c.name,
      course: c.course?.name ?? null,
      level: c.course?.level?.name ?? null,
      teachers: c.class_members.map((m) => m.teacher?.full_name).filter(Boolean).join("; "),
      status: c.status,
      students: active,
      sessions: att?.sessions ?? 0,
      attendance: pct(att?.rate ?? null),
      homework: pct(homeworkSummary(homework.filter((h) => h.class_id === c.id)).completionRate),
      average: g.suppressed ? null : g.averageOfStudents,
      withResults: g.studentsWithResults,
    }
  })
  return {
    columns: [
      { key: "code", label: "Code", kind: "text" },
      { key: "name", label: "Class", kind: "text" },
      { key: "course", label: "Course", kind: "text" },
      { key: "level", label: "Level", kind: "text" },
      { key: "teachers", label: "Teachers", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "students", label: "Active students", kind: "number" },
      { key: "sessions", label: "Sessions recorded", kind: "number" },
      { key: "attendance", label: "Attendance %", kind: "percent" },
      { key: "homework", label: "Homework handed in %", kind: "percent" },
      { key: "withResults", label: "Students with results", kind: "number" },
      { key: "average", label: "Average of students %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Classes", value: String(rows.length) },
      { label: "Active students", value: String(rows.reduce((a, r) => a + r.students, 0)) },
    ],
    notes: [
      "Average of students: each student's own average of class work first, then the mean.",
      withheld ? `${withheld} class average${withheld === 1 ? " is" : "s are"} withheld (fewer than 3 students with results).` : "",
    ].filter(Boolean),
    chart: { title: "Attendance by class", kind: "attendance", data: rows.map((r) => ({ label: r.name, value: r.attendance, detail: `${r.sessions} sessions` })) },
  }
}

async function teachersReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const classIds = scope.classes.map((c) => c.id)
  const [teacherRows, attendance, assignments, results] = await Promise.all([
    db.from("teachers").select("id, teacher_code, full_name, status, profile_id").is("deleted_at", null).order("full_name"),
    attendanceBy(db, f, "teacher"),
    db
      .from("assignments")
      .select("id, class_id, created_by, created_at, submissions(status, submission_grades(returned_at))")
      .in("class_id", ids(classIds))
      .gte("created_at", `${f.from}T00:00:00+07:00`)
      .lte("created_at", `${f.to}T23:59:59+07:00`),
    resultsInScope(db, f, scope, f),
  ])
  if (teacherRows.error) throw fromPostgrestError(teacherRows.error)
  if (assignments.error) throw fromPostgrestError(assignments.error)
  const rows = teacherRows.data
    .filter((t) => !f.teacherId || t.id === f.teacherId)
    .map((t) => {
      const own = scope.classes.filter((c) => c.class_members.some((m) => m.teacher?.id === t.id))
      const ownIds = new Set(own.map((c) => c.id))
      const students = new Set(own.flatMap((c) => c.enrollments.filter((e) => e.status === "active").map((e) => e.student_id)))
      const set = (assignments.data ?? []).filter((a) => ownIds.has(a.class_id) && a.created_by === t.profile_id)
      const waiting = (assignments.data ?? []).filter((a) => ownIds.has(a.class_id)).flatMap((a) => a.submissions).filter((s) => s.status === "submitted").length
      const g = groupSummary(results.filter((r) => r.classId && ownIds.has(r.classId)))
      return {
        code: t.teacher_code,
        name: t.full_name,
        status: t.status,
        classes: own.length,
        students: students.size,
        sessions: attendance.get(t.id)?.sessions ?? 0,
        attendance: pct(attendance.get(t.id)?.rate ?? null),
        assignmentsSet: set.length,
        awaitingMarking: waiting,
        average: g.suppressed ? null : g.averageOfStudents,
      }
    })
    .filter((r) => r.classes > 0 || (!f.classId && !f.courseId && !f.levelId))
  return {
    columns: [
      { key: "code", label: "Code", kind: "text" },
      { key: "name", label: "Teacher", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "classes", label: "Classes", kind: "number" },
      { key: "students", label: "Active students", kind: "number" },
      { key: "sessions", label: "Registers taken", kind: "number" },
      { key: "attendance", label: "Attendance in their classes %", kind: "percent" },
      { key: "assignmentsSet", label: "Assignments set", kind: "number" },
      { key: "awaitingMarking", label: "Submissions awaiting marking", kind: "number" },
      { key: "average", label: "Average of students %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Teachers", value: String(rows.length) },
      { label: "Awaiting marking", value: String(rows.reduce((a, r) => a + r.awaitingMarking, 0)) },
    ],
    notes: ["Awaiting marking counts handed-in work without a grade, whenever it was set.", "Averages are withheld when fewer than 3 students have results."],
  }
}

async function attendanceReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const [byStudent, trend] = await Promise.all([
    attendanceBy(db, f, "student"),
    db.rpc("attendance_trend", { date_from: f.from, date_to: f.to, class_filter: f.classId ?? null, teacher_filter: f.teacherId ?? null, student_filter: f.studentId ?? null }),
  ])
  if (trend.error) throw fromPostgrestError(trend.error)
  const rows = scope.students.map((s) => {
    const a = byStudent.get(s.id)
    return {
      code: s.student_code,
      name: s.full_name,
      classes: s.classes.join("; "),
      present: a?.counts.present ?? 0,
      late: a?.counts.late ?? 0,
      absent: a?.counts.absent ?? 0,
      excused: a?.counts.excused ?? 0,
      rate: pct(a?.rate ?? null),
    }
  })
  const total = rows.reduce((acc, r) => ({ present: acc.present + r.present, late: acc.late + r.late, absent: acc.absent + r.absent, excused: acc.excused + r.excused }), { present: 0, late: 0, absent: 0, excused: 0 })
  return {
    columns: [
      { key: "code", label: "Code", kind: "text" },
      { key: "name", label: "Student", kind: "text" },
      { key: "classes", label: "Classes", kind: "text" },
      { key: "present", label: "Present", kind: "number" },
      { key: "late", label: "Late", kind: "number" },
      { key: "absent", label: "Absent", kind: "number" },
      { key: "excused", label: "Excused", kind: "number" },
      { key: "rate", label: "Attendance %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Attendance", value: rateText(attendanceRate(total)) },
      { label: "Absences", value: String(total.absent) },
      { label: "Late arrivals", value: String(total.late) },
    ],
    notes: ["Attendance % = (present + late) ÷ (present + late + absent). Excused sessions are not counted."],
    chart: {
      title: "Attendance by week",
      kind: "attendance",
      data: trend.data.map((w) => {
        const c = { present: Number(w.present), late: Number(w.late), absent: Number(w.absent), excused: Number(w.excused) }
        return { label: String(w.week_start).slice(5, 10).split("-").reverse().join("/"), value: pct(attendanceRate(c)), detail: `${c.present + c.late} attended, ${c.absent} absent` }
      }),
    },
  }
}

async function assignmentsReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const byId = new Map(scope.classes.map((c) => [c.id, c]))
  const { data, error } = await db
    .from("assignments")
    .select("id, title, class_id, assignment_type, status, due_at, publish_at, max_score, submissions(student_id, status, is_late, attempt, submission_grades(score, returned_at))")
    .in("class_id", ids([...byId.keys()]))
    .neq("status", "draft")
    .order("due_at", { ascending: false, nullsFirst: false })
  if (error) throw fromPostgrestError(error)
  const inRange = (d: string | null) => d !== null && d.slice(0, 10) >= f.from && d.slice(0, 10) <= f.to
  const rows = data
    .filter((a) => inRange(a.due_at ?? a.publish_at))
    .map((a) => {
      const klass = byId.get(a.class_id)!
      const enrolled = klass.enrollments.filter((e) => e.status !== "pending" && e.status !== "withdrawn" && e.student && !e.student.deleted_at).length
      const handed = new Map<string, (typeof a.submissions)[number]>()
      for (const s of a.submissions) if (s.status !== "in_progress" && (!handed.has(s.student_id) || s.attempt > handed.get(s.student_id)!.attempt)) handed.set(s.student_id, s)
      const latest = [...handed.values()]
      const returned = latest.flatMap((s) => (s.submission_grades?.returned_at ? [Number(s.submission_grades.score) / Number(a.max_score)] : []))
      const due = a.due_at ? Date.parse(a.due_at) < Date.now() : false
      return {
        title: a.title,
        class: klass.name,
        type: a.assignment_type,
        status: a.status,
        due: a.due_at?.slice(0, 10) ?? null,
        students: enrolled,
        handedIn: latest.length,
        late: latest.filter((s) => s.is_late).length,
        missing: due ? Math.max(0, enrolled - latest.length) : null,
        awaiting: latest.filter((s) => !s.submission_grades).length,
        returned: returned.length,
        average: returned.length ? Math.round((returned.reduce((x, y) => x + y, 0) / returned.length) * 1000) / 10 : null,
      }
    })
  return {
    columns: [
      { key: "title", label: "Assignment", kind: "text" },
      { key: "class", label: "Class", kind: "text" },
      { key: "type", label: "Type", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "due", label: "Due", kind: "date" },
      { key: "students", label: "Students", kind: "number" },
      { key: "handedIn", label: "Handed in", kind: "number" },
      { key: "late", label: "Late", kind: "number" },
      { key: "missing", label: "Missing (past due)", kind: "number" },
      { key: "awaiting", label: "Awaiting marking", kind: "number" },
      { key: "returned", label: "Grades returned", kind: "number" },
      { key: "average", label: "Average of returned %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Assignments", value: String(rows.length) },
      { label: "Awaiting marking", value: String(rows.reduce((a, r) => a + r.awaiting, 0)) },
      { label: "Missing", value: String(rows.reduce((a, r) => a + (r.missing ?? 0), 0)) },
    ],
    notes: ["Assignments are listed by due date (or release date) in the period. Averages use returned grades only; resubmissions count once (the latest)."],
  }
}

async function testsReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const byId = new Map(scope.classes.map((c) => [c.id, c]))
  const { data, error } = await db
    .from("tests")
    .select("id, title, class_id, status, total_score, max_attempts, available_from, published_at, test_attempts(student_id, status, score)")
    .in("class_id", ids([...byId.keys()]))
    .neq("status", "draft")
  if (error) throw fromPostgrestError(error)
  const inRange = (d: string | null) => d !== null && d.slice(0, 10) >= f.from && d.slice(0, 10) <= f.to
  const rows = data
    .filter((t) => inRange(t.available_from ?? t.published_at))
    .map((t) => {
      const best = new Map<string, number>()
      for (const a of t.test_attempts) if (a.status === "graded" && a.score !== null) best.set(a.student_id, Math.max(best.get(a.student_id) ?? -1, Number(a.score)))
      const scores = [...best.values()].map((s) => (s / Number(t.total_score)) * 100)
      const round = (v: number) => Math.round(v * 10) / 10
      return {
        title: t.title,
        class: byId.get(t.class_id)!.name,
        status: t.status,
        date: (t.available_from ?? t.published_at)?.slice(0, 10) ?? null,
        students: new Set(t.test_attempts.map((a) => a.student_id)).size,
        attempts: t.test_attempts.length,
        awaiting: t.test_attempts.filter((a) => a.status === "submitted").length,
        graded: best.size,
        average: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        lowest: scores.length ? round(Math.min(...scores)) : null,
        highest: scores.length ? round(Math.max(...scores)) : null,
      }
    })
  return {
    columns: [
      { key: "title", label: "Test", kind: "text" },
      { key: "class", label: "Class", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "date", label: "Opened", kind: "date" },
      { key: "students", label: "Students attempted", kind: "number" },
      { key: "attempts", label: "Attempts", kind: "number" },
      { key: "awaiting", label: "Awaiting marking", kind: "number" },
      { key: "graded", label: "Students graded", kind: "number" },
      { key: "average", label: "Average %", kind: "percent" },
      { key: "lowest", label: "Lowest %", kind: "percent" },
      { key: "highest", label: "Highest %", kind: "percent" },
    ],
    rows,
    totals: [
      { label: "Tests", value: String(rows.length) },
      { label: "Awaiting marking", value: String(rows.reduce((a, r) => a + r.awaiting, 0)) },
    ],
    notes: ["Scores use each student's best graded attempt. Tests are listed by opening date in the period."],
  }
}

async function tuitionReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const filtered = Boolean(f.classId || f.teacherId || f.courseId || f.levelId || f.studentId)
  const scope = filtered ? await loadScope(db, f) : null
  let invoiceQuery = db
    .from("invoice_balances")
    .select("id, invoice_number, student_id, student_code, student_name, description, issue_date, due_date, amount, paid, remaining, payment_status")
    .gte("issue_date", f.from)
    .lte("issue_date", f.to)
    .neq("payment_status", "void")
    .order("issue_date", { ascending: false })
  let paymentQuery = db.from("payments").select("amount, paid_on, student_id").eq("status", "completed").gte("paid_on", f.from).lte("paid_on", f.to)
  if (scope) {
    const studentIds = ids(scope.students.map((s) => s.id))
    invoiceQuery = invoiceQuery.in("student_id", studentIds)
    paymentQuery = paymentQuery.in("student_id", studentIds)
  }
  const [invoices, payments] = await Promise.all([invoiceQuery, paymentQuery])
  if (invoices.error) throw fromPostgrestError(invoices.error)
  if (payments.error) throw fromPostgrestError(payments.error)
  const rows = invoices.data.map((i) => ({
    invoice: i.invoice_number,
    code: i.student_code,
    student: i.student_name,
    description: i.description,
    issued: i.issue_date,
    due: i.due_date,
    amount: Number(i.amount),
    paid: Number(i.paid),
    remaining: Number(i.remaining),
    status: i.payment_status,
  }))
  const sum = (k: "amount" | "paid" | "remaining") => rows.reduce((a, r) => a + r[k], 0)
  const months = new Map<string, number>()
  for (const p of payments.data) months.set(p.paid_on.slice(0, 7), (months.get(p.paid_on.slice(0, 7)) ?? 0) + Number(p.amount))
  const monthKeys: string[] = []
  for (let m = f.from.slice(0, 7); m <= f.to.slice(0, 7); m = nextMonth(m)) monthKeys.push(m)
  return {
    columns: [
      { key: "invoice", label: "Invoice", kind: "text" },
      { key: "code", label: "Student code", kind: "text" },
      { key: "student", label: "Student", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
      { key: "issued", label: "Issued", kind: "date" },
      { key: "due", label: "Due", kind: "date" },
      { key: "amount", label: "Amount (đ)", kind: "money" },
      { key: "paid", label: "Paid (đ)", kind: "money" },
      { key: "remaining", label: "Remaining (đ)", kind: "money" },
      { key: "status", label: "Status", kind: "text" },
    ],
    rows,
    totals: [
      { label: "Invoiced", value: money(sum("amount")) },
      { label: "Paid on these invoices", value: money(sum("paid")) },
      { label: "Outstanding", value: money(sum("remaining")) },
      { label: "Collected in the period", value: money(payments.data.reduce((a, p) => a + Number(p.amount), 0)) },
    ],
    notes: ["Invoices issued in the period (void invoices excluded). “Collected” counts completed payments received in the period, whichever invoice they pay."],
    chart: { title: "Payments received by month", kind: "money", data: monthKeys.map((m) => ({ label: `${m.slice(5)}/${m.slice(0, 4)}`, value: months.get(m) ?? 0 })) },
  }
}

async function progressReport(db: DbClient, f: ReportFilters): Promise<ReportResult> {
  const scope = await loadScope(db, f)
  const before = previousRange(f)
  const [current, previous] = await Promise.all([resultsInScope(db, f, scope, f), resultsInScope(db, before, scope, { ...f, ...before })])
  const by = (results: Result[], id: string) => results.filter((r) => r.studentId === id)
  const rows = scope.students.map((s) => {
    const now = summarize(by(current, s.id))
    const then = summarize(by(previous, s.id))
    const teacher = summarize(by(current, s.id).filter((r) => r.assessedBy === "teacher"))
    const tests = summarize(by(current, s.id).filter((r) => r.source === "test"))
    return {
      code: s.student_code,
      name: s.full_name,
      level: s.english_level_code,
      results: now.scored,
      average: now.averagePercent,
      previousResults: then.scored,
      previous: then.averagePercent,
      change: now.averagePercent !== null && then.averagePercent !== null ? Math.round((now.averagePercent - then.averagePercent) * 10) / 10 : null,
      teacherAssessed: teacher.averagePercent,
      tests: tests.averagePercent,
      bands: now.bandResults ? now.averageBand : null,
    }
  })
  return {
    columns: [
      { key: "code", label: "Code", kind: "text" },
      { key: "name", label: "Student", kind: "text" },
      { key: "level", label: "English level (recorded)", kind: "text" },
      { key: "results", label: "Results", kind: "number" },
      { key: "average", label: "Average %", kind: "percent" },
      { key: "previousResults", label: "Results before", kind: "number" },
      { key: "previous", label: "Average before %", kind: "percent" },
      { key: "change", label: "Change (points)", kind: "number" },
      { key: "teacherAssessed", label: "Teacher-assessed %", kind: "percent" },
      { key: "tests", label: "Tests %", kind: "percent" },
      { key: "bands", label: "IELTS-style band (mean)", kind: "number" },
    ],
    rows,
    totals: [
      { label: "Students", value: String(rows.length) },
      { label: "Improved", value: String(rows.filter((r) => (r.change ?? 0) > 0).length) },
      { label: "Declined", value: String(rows.filter((r) => (r.change ?? 0) < 0).length) },
    ],
    notes: [
      `“Before” is ${before.from} to ${before.to}, the same number of days just before the period.`,
      "Averages are plain means of published result percentages; read changes based on few results with care. Bands are never converted to percentages.",
    ],
  }
}

export async function runReport(db: DbClient, key: ReportKey, f: ReportFilters): Promise<ReportResult> {
  switch (key) {
    case "students":
      return studentsReport(db, f)
    case "classes":
      return classesReport(db, f)
    case "teachers":
      return teachersReport(db, f)
    case "attendance":
      return attendanceReport(db, f)
    case "assignments":
      return assignmentsReport(db, f)
    case "tests":
      return testsReport(db, f)
    case "tuition":
      return tuitionReport(db, f)
    case "progress":
      return progressReport(db, f)
  }
}

/** Options for the filter bar, as the caller may see them. */
export async function loadFilterOptions(db: DbClient) {
  const [classes, teachers, courses, levels, students] = await Promise.all([
    db.from("classes").select("id, name").is("deleted_at", null).order("name"),
    db.from("teachers").select("id, full_name").is("deleted_at", null).order("full_name"),
    db.from("courses").select("id, name").is("deleted_at", null).order("name"),
    db.from("levels").select("id, name, subject:subjects(name)").is("deleted_at", null).order("sort_order"),
    db.from("students").select("id, full_name, student_code").is("deleted_at", null).order("full_name").limit(2000),
  ])
  for (const r of [classes, teachers, courses, levels, students]) if (r.error) throw fromPostgrestError(r.error)
  return {
    classes: classes.data ?? [],
    teachers: teachers.data ?? [],
    courses: courses.data ?? [],
    levels: (levels.data ?? []).map((l) => ({ id: l.id, name: l.subject ? `${l.subject.name} – ${l.name}` : l.name })),
    students: (students.data ?? []).map((s) => ({ id: s.id, name: `${s.full_name} (${s.student_code})` })),
  }
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}
const money = (v: number) => `${Math.round(v).toLocaleString("vi-VN")} đ`
const rateText = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)
