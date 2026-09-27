import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { WordForm } from "@/features/english/components/word-form"
import { getWord } from "@/features/english/server/vocabulary-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit word") }
}

export default async function EditWordPage({ params }: PageProps<"/english/vocabulary/words/[id]/edit">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.wordEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const word = await getWord(await createClient(), id)
  if (!word) notFound()
  // Teachers edit their own words (the database enforces it).
  if (!can(user.permissions, "english.write", ["all"]) && word.created_by !== user.id) redirect(`${routes.vocabulary}?view=words`)

  return (
    <>
      <PageHeader title={t("Edit “{word}”", { word: word.word })} />
      <WordForm
        cancelHref={`${routes.vocabulary}?view=words`}
        initial={{
          wordId: word.id,
          word: word.word,
          ipa: word.ipa ?? "",
          partOfSpeech: word.part_of_speech,
          meaningVi: word.meaning_vi,
          definitionEn: word.definition_en ?? "",
          example: word.example ?? "",
          collocations: word.collocations.join(", "),
          synonyms: word.synonyms.join(", "),
          antonyms: word.antonyms.join(", "),
          cefrLevel: word.cefr_level ?? "",
          topic: word.topic ?? "",
          published: word.status === "published",
        }}
      />
    </>
  )
}
