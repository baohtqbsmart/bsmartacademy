import "server-only"

import { dueCount, listProgress } from "@/features/english/server/vocabulary-service"
import { MASTERED_BOX, skillProfile, type EnglishSkill } from "@/features/english/skills"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// All reads run as the caller (RLS): a student sees their own results, a
// parent their children's, a teacher the students they teach.

export async function loadPerformance(db: DbClient, studentIds?: string[]) {
  const { data, error } = await db.rpc("english_skill_performance", { target_student_ids: studentIds ?? null })
  if (error) throw fromPostgrestError(error)
  return data
}

/** One learner's dashboard: skills, vocabulary progress, recent work, what to do next. */
export async function loadLearnerOverview(db: DbClient, studentId: string) {
  const [performance, progress, practice, attempts, submissions, lessons] = await Promise.all([
    loadPerformance(db, [studentId]),
    listProgress(db, studentId),
    db
      .from("vocabulary_practice")
      .select("id, activity, correct, total, created_at, set:vocabulary_sets(id, title)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("lesson_attempts")
      .select("id, lesson_id, score, max_score, created_at, lesson:lessons(id, title, skill)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("lesson_submissions")
      .select("id, lesson_id, status, score, max_score, submitted_at, reviewed_at, lesson:lessons(id, title, skill)")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(20),
    db.from("lessons").select("id, title, skill, cefr_level").eq("status", "published").order("title"),
  ])
  for (const result of [practice, attempts, submissions, lessons]) if (result.error) throw fromPostgrestError(result.error)

  const done = new Set([...(attempts.data ?? []).map((a) => a.lesson_id), ...(submissions.data ?? []).map((s) => s.lesson_id)])
  const profile = skillProfile(performance)

  // Most recent activity across the three sources.
  const activity = [
    ...(practice.data ?? []).map((p) => ({
      id: `p-${p.id}`,
      skill: "vocabulary" as EnglishSkill,
      title: p.set?.title ?? "Vocabulary",
      detail: `${p.activity.replace("_", " ")} · ${p.correct}/${p.total}`,
      at: p.created_at,
      href: null as string | null,
    })),
    ...(attempts.data ?? []).map((a) => ({
      id: `a-${a.id}`,
      skill: (a.lesson?.skill ?? "grammar") as EnglishSkill,
      title: a.lesson?.title ?? "Lesson",
      detail: `exercises · ${Number(a.score)}/${Number(a.max_score)}`,
      at: a.created_at,
      href: a.lesson ? `/english/lessons/${a.lesson.id}` : null,
    })),
    ...(submissions.data ?? []).map((s) => ({
      id: `s-${s.id}`,
      skill: (s.lesson?.skill ?? "writing") as EnglishSkill,
      title: s.lesson?.title ?? "Lesson",
      detail: s.status === "reviewed" ? `feedback · ${Number(s.score)}/${Number(s.max_score)}` : "waiting for feedback",
      at: s.reviewed_at ?? s.submitted_at,
      href: `/english/submissions/${s.id}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10)

  return {
    profile,
    vocabulary: {
      learning: progress.length,
      mastered: progress.filter((p) => p.box >= MASTERED_BOX).length,
      due: dueCount(progress),
    },
    waitingForFeedback: (submissions.data ?? []).filter((s) => s.status === "submitted").length,
    activity,
    nextLessons: (lessons.data ?? []).filter((l) => !done.has(l.id)),
  }
}

export type LearnerOverview = Awaited<ReturnType<typeof loadLearnerOverview>>

/** Students whose English results the caller may see (for staff and parents). */
export async function listVisibleStudents(db: DbClient, classId?: string) {
  if (classId) {
    const { data, error } = await db
      .from("enrollments")
      .select("student:students(id, full_name, student_code)")
      .eq("class_id", classId)
      .in("status", ["active", "completed"])
    if (error) throw fromPostgrestError(error)
    return data.flatMap((e) => (e.student ? [e.student] : [])).sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
  }
  const { data, error } = await db.from("students").select("id, full_name, student_code").is("deleted_at", null).order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}
