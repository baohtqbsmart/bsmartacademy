import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { WordForm } from "@/features/english/components/word-form"
import { requireRouteAccess } from "@/lib/auth/session"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New word") }
}

export default async function NewWordPage() {
  const t = await getT()
  await requireRouteAccess(routes.wordNew)
  return (
    <>
      <PageHeader title={t("New word")} description={t("Added to the shared word bank.")} />
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
