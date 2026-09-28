import "server-only"

import { addDays, todayInAcademy } from "@/lib/dates"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

export type PathItem = {
  kind: "lesson" | "assignment" | "test"
  id: string
  title: string
  done: boolean
}

export type PathModule = {
  id: string | null
  title: string
  description: string
  items: PathItem[]
}

const HANDED_IN = new Set(["submitted", "graded", "returned"])

/**
 * A class's learning path for one student: the course's modules with their
 * lessons, and the class's released assignments and tests placed in them.
 * "Done" means real work: a handed-in assignment or test, a practised or
 * submitted lesson. Everything is read with the caller's rights (RLS).
 */
export async function loadLearningPath(db: DbClient, classId: string, courseId: string | null, studentId: string) {
  const [units, assignments, tests] = await Promise.all([
    courseId
      ? db
          .from("course_units")
          .select("id, position, title, description, unit_lessons(position, lesson:lessons(id, title, status))")
          .eq("course_id", courseId)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    db.from("assignments").select("id, title, unit_id, status, due_at").eq("class_id", classId).in("status", ["published", "closed"]).is("archived_at", null),
    db.from("tests").select("id, title, unit_id, status").eq("class_id", classId).in("status", ["published", "closed"]).is("archived_at", null),
  ])
  for (const r of [units, assignments, tests]) if (r.error) throw fromPostgrestError(r.error)

  const lessonIds = (units.data ?? []).flatMap((u) => u.unit_lessons.flatMap((ul) => (ul.lesson?.status === "published" ? [ul.lesson.id] : [])))
  const assignmentIds = (assignments.data ?? []).map((a) => a.id)
  const testIds = (tests.data ?? []).map((t) => t.id)

  const [submissions, attempts, practised, lessonWork] = await Promise.all([
    assignmentIds.length
      ? db.from("submissions").select("assignment_id, status").eq("student_id", studentId).in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    testIds.length
      ? db.from("test_attempts").select("test_id, status").eq("student_id", studentId).in("test_id", testIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? db.from("lesson_attempts").select("lesson_id").eq("student_id", studentId).in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? db.from("lesson_submissions").select("lesson_id").eq("student_id", studentId).in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [submissions, attempts, practised, lessonWork]) if (r.error) throw fromPostgrestError(r.error)

  const doneAssignments = new Set((submissions.data ?? []).filter((s) => HANDED_IN.has(s.status)).map((s) => s.assignment_id))
  const doneTests = new Set((attempts.data ?? []).filter((a) => a.status !== "in_progress").map((a) => a.test_id))
  const doneLessons = new Set([...(practised.data ?? []), ...(lessonWork.data ?? [])].map((l) => l.lesson_id))

  const modules: PathModule[] = (units.data ?? []).map((u) => ({
    id: u.id,
    title: u.title,
    description: u.description,
    items: [
      ...[...u.unit_lessons]
        .sort((a, b) => a.position - b.position)
        .flatMap((ul) =>
          ul.lesson?.status === "published"
            ? [
                {
                  kind: "lesson" as const,
                  id: ul.lesson.id,
                  title: ul.lesson.title,
                  done: doneLessons.has(ul.lesson.id),
                },
              ]
            : []
        ),
      ...(assignments.data ?? [])
        .filter((a) => a.unit_id === u.id)
        .map((a) => ({
          kind: "assignment" as const,
          id: a.id,
          title: a.title,
          done: doneAssignments.has(a.id),
        })),
      ...(tests.data ?? [])
        .filter((t) => t.unit_id === u.id)
        .map((t) => ({
          kind: "test" as const,
          id: t.id,
          title: t.title,
          done: doneTests.has(t.id),
        })),
    ],
  }))
  const unplaced: PathItem[] = [
    ...(assignments.data ?? [])
      .filter((a) => !a.unit_id)
      .map((a) => ({
        kind: "assignment" as const,
        id: a.id,
        title: a.title,
        done: doneAssignments.has(a.id),
      })),
    ...(tests.data ?? [])
      .filter((t) => !t.unit_id)
      .map((t) => ({
        kind: "test" as const,
        id: t.id,
        title: t.title,
        done: doneTests.has(t.id),
      })),
  ]
  if (unplaced.length)
    modules.push({
      id: null,
      title: "Other work",
      description: "",
      items: unplaced,
    })

  const items = modules.flatMap((m) => m.items)
  const done = items.filter((i) => i.done).length
  return {
    modules,
    total: items.length,
    done,
    percent: items.length ? Math.round((done / items.length) * 100) : null,
  }
}

export type LearningPath = Awaited<ReturnType<typeof loadLearningPath>>

/** One student's completion of each of their classes (classId → percent, null when nothing to do yet). */
export async function loadCompletionByClass(db: DbClient, classes: { id: string; course: { id: string } | null }[], studentId: string) {
  const entries = await Promise.all(
    classes.map(async (c) => [c.id, (await loadClassCompletion(db, c.id, c.course?.id ?? null, [studentId])).get(studentId)?.percent ?? null] as const)
  )
  return new Map(entries)
}

/** Current and best streak of learning days, and the last 14 days. */
export async function loadStreak(db: DbClient, studentId: string, today: string = todayInAcademy()) {
  const since = addDays(today, -179)
  const { data, error } = await db.rpc("learning_days", {
    target_student: studentId,
    since,
  })
  if (error) throw fromPostgrestError(error)
  return summarizeStreak(new Set(data.map((d) => d.day)), today)
}

export function summarizeStreak(days: Set<string>, today: string) {
  // A streak is still alive today if the student learnt yesterday.
  let current = 0
  let cursor = days.has(today) ? today : addDays(today, -1)
  while (days.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }
  let best = 0
  let run = 0
  for (const day of [...days].sort()) {
    run = days.has(addDays(day, -1)) ? run + 1 : 1
    best = Math.max(best, run)
  }
  const recent = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13)
    return { day, active: days.has(day) }
  })
  return { current, best, activeToday: days.has(today), recent }
}

export type Streak = ReturnType<typeof summarizeStreak>

/**
 * Completion of every student in a class in one pass (for staff views):
 * the same items and the same definition of "done" as the learning path.
 */
export async function loadClassCompletion(db: DbClient, classId: string, courseId: string | null, studentIds: string[]) {
  const result = new Map<string, { done: number; total: number; percent: number | null }>()
  if (studentIds.length === 0) return result
  const [units, assignments, tests] = await Promise.all([
    courseId
      ? db.from("course_units").select("unit_lessons(lesson:lessons(id, status))").eq("course_id", courseId)
      : Promise.resolve({ data: [], error: null }),
    db.from("assignments").select("id").eq("class_id", classId).in("status", ["published", "closed"]).is("archived_at", null),
    db.from("tests").select("id").eq("class_id", classId).in("status", ["published", "closed"]).is("archived_at", null),
  ])
  for (const r of [units, assignments, tests]) if (r.error) throw fromPostgrestError(r.error)
  const lessonIds = (units.data ?? []).flatMap((u) => u.unit_lessons.flatMap((ul) => (ul.lesson?.status === "published" ? [ul.lesson.id] : [])))
  const assignmentIds = (assignments.data ?? []).map((a) => a.id)
  const testIds = (tests.data ?? []).map((t) => t.id)
  const total = lessonIds.length + assignmentIds.length + testIds.length

  const [submissions, attempts, practised, lessonWork] = await Promise.all([
    assignmentIds.length
      ? db.from("submissions").select("student_id, assignment_id, status").in("student_id", studentIds).in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    testIds.length
      ? db.from("test_attempts").select("student_id, test_id, status").in("student_id", studentIds).in("test_id", testIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? db.from("lesson_attempts").select("student_id, lesson_id").in("student_id", studentIds).in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? db.from("lesson_submissions").select("student_id, lesson_id").in("student_id", studentIds).in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [submissions, attempts, practised, lessonWork]) if (r.error) throw fromPostgrestError(r.error)

  const done = new Map<string, Set<string>>()
  const mark = (student: string, key: string) => (done.get(student) ?? done.set(student, new Set()).get(student)!).add(key)
  for (const s of submissions.data ?? []) if (HANDED_IN.has(s.status)) mark(s.student_id, `a:${s.assignment_id}`)
  for (const a of attempts.data ?? []) if (a.status !== "in_progress") mark(a.student_id, `t:${a.test_id}`)
  for (const l of [...(practised.data ?? []), ...(lessonWork.data ?? [])]) mark(l.student_id, `l:${l.lesson_id}`)

  for (const id of studentIds) {
    const count = done.get(id)?.size ?? 0
    result.set(id, {
      done: count,
      total,
      percent: total ? Math.round((count / total) * 100) : null,
    })
  }
  return result
}

/** A course's modules, in order (for choosing where work belongs). */
export async function listCourseUnits(db: DbClient, courseId: string) {
  const { data, error } = await db.from("course_units").select("id, title, position").eq("course_id", courseId).order("position")
  if (error) throw fromPostgrestError(error)
  return data
}

/** The database checks the module belongs to the class's course. */
export async function setWorkUnit(db: DbClient, kind: "assignment" | "test", id: string, unitId: string | null) {
  const table = kind === "assignment" ? "assignments" : "tests"
  const { error } = await db.from(table).update({ unit_id: unitId }).eq("id", id)
  if (error) throw fromPostgrestError(error)
}
