import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { lessonPath, routes } from "@/config/routes"
import { LessonForm } from "@/features/english/components/lesson-form"
import { getLesson } from "@/features/english/server/lesson-service"
import { listWords } from "@/features/english/server/vocabulary-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit lesson") }
}

export default async function EditLessonPage({ params }: PageProps<"/english/lessons/[id]/edit">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.lessonEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [lesson, words] = await Promise.all([getLesson(db, id), listWords(db)])
  if (!lesson) notFound()
  const mayEdit = can(user.permissions, "english.write", ["all"]) || lesson.created_by === user.id
  if (!mayEdit || lesson.status === "archived") redirect(lessonPath(id))

  return (
    <>
      <PageHeader title={t("Edit lesson")} description={lesson.title} />
      <LessonForm
        skillLocked
        cancelHref={lessonPath(id)}
        words={words.map((w) => ({ id: w.id, word: w.word, meaning_vi: w.meaning_vi, topic: w.topic, cefr_level: w.cefr_level }))}
        initial={{
          lessonId: lesson.id,
          skill: lesson.skill,
          title: lesson.title,
          cefrLevel: lesson.cefr_level ?? "",
          topic: lesson.topic ?? "",
          summary: lesson.summary ?? "",
          body: lesson.body ?? "",
          form: lesson.form ?? "",
          usage: lesson.usage ?? "",
          examples: lesson.examples.join("\n"),
          mistakes: lesson.mistakes.map((m) => ({ incorrect: m.incorrect, correct: m.correct, note: m.note ?? "" })),
          responseMode: lesson.response_mode ?? "",
          minWords: lesson.min_words ? String(lesson.min_words) : "",
          maxWords: lesson.max_words ? String(lesson.max_words) : "",
          rubric: lesson.rubricItems.map((r) => ({ criterion: r.criterion, description: r.description ?? "", maxPoints: String(r.max_points) })),
          maxScore: String(Number(lesson.max_score)),
          transcript: lesson.secret?.transcript ?? "",
          modelAnswer: lesson.secret?.model_answer ?? "",
          wordIds: lesson.words.map((w) => w.id),
        }}
      />
    </>
  )
}
