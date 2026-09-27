import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { WordForm } from "@/features/english/components/word-form"
import { requireRouteAccess } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New word" }

export default async function NewWordPage() {
  await requireRouteAccess(routes.wordNew)
  return (
    <>
      <PageHeader title="New word" description="Added to the shared word bank." />
      <WordForm
        cancelHref={`${routes.vocabulary}?view=words`}
        initial={{
          word: "",
          ipa: "",
          partOfSpeech: "noun",
          meaningVi: "",
          definitionEn: "",
          example: "",
          collocations: "",
          synonyms: "",
          antonyms: "",
          cefrLevel: "",
          topic: "",
          published: true,
        }}
      />
    </>
  )
}
