import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { LessonForm } from "@/features/english/components/lesson-form"
import { listWords } from "@/features/english/server/vocabulary-service"
import { LESSON_SKILLS } from "@/features/english/skills"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "New lesson" }

export default async function NewLessonPage({ searchParams }: PageProps<"/english/lessons/new">) {
  await requireRouteAccess(routes.lessonNew)
  const skill = enumParam(await searchParams, "skill", LESSON_SKILLS) ?? "grammar"
  const words = await listWords(await createClient())
  return (
    <>
      <PageHeader title="New lesson" />
      <LessonForm
        skillLocked={false}
        cancelHref={routes.lessons}
        words={words.map((w) => ({ id: w.id, word: w.word, meaning_vi: w.meaning_vi, topic: w.topic, cefr_level: w.cefr_level }))}
        initial={{
          skill,
          title: "",
          cefrLevel: "",
          topic: "",
          summary: "",
          body: "",
          form: "",
          usage: "",
          examples: "",
          mistakes: [],
          responseMode: skill === "writing" ? "text" : skill === "speaking" ? "audio_or_video" : skill === "pronunciation" ? "audio" : "",
          minWords: "",
          maxWords: "",
          rubric: [],
          maxScore: "10",
          transcript: "",
          modelAnswer: "",
          wordIds: [],
        }}
      />
    </>
  )
}
