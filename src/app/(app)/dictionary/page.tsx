import { BookMarkedIcon, SearchIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Stagger, StaggerItem } from "@/components/motion/reveal"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { routes } from "@/config/routes"
import { searchDictionary } from "@/features/dictionary/server/dictionary-service"
import { SpeakButton } from "@/features/english/components/media"
import { PART_OF_SPEECH_LABELS } from "@/features/english/skills"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Dictionary") }
}

export default async function DictionaryPage({ searchParams }: PageProps<"/dictionary">) {
  const t = await getT()
  await requireRouteAccess(routes.dictionary)
  const q = (firstParam(await searchParams, "q") ?? "").trim()
  const entries = await searchDictionary(await createClient(), q)

  return (
    <>
      <PageHeader title={t("Dictionary")} description={t("English words from the BSmart Academy word bank, with Vietnamese meanings and examples.")} />
      <form role="search" action={routes.dictionary} className="flex max-w-xl gap-2">
        <label htmlFor="dictionary-q" className="sr-only">
          {t("Search words or meanings")}
        </label>
        <Input id="dictionary-q" name="q" defaultValue={q} placeholder={t("Type an English word or a Vietnamese meaning")} autoFocus autoComplete="off" />
        <Button type="submit">
          <SearchIcon aria-hidden /> {t("Search")}
        </Button>
      </form>
      {entries.length === 0 ? (
        <EmptyState icon={BookMarkedIcon} title={q ? t("No words match") : t("The word bank is empty")} description={q ? t("Try a different spelling or search by meaning.") : undefined} />
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <StaggerItem key={entry.id}>
              <article className="bg-card grid h-full content-start gap-2 rounded-xl border p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-2xl font-semibold">{entry.word}</h2>
                  {entry.ipa && <span className="text-muted-foreground font-mono text-sm">{entry.ipa}</span>}
                  <SpeakButton text={entry.word} size="icon" label={t("Play the word")} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{t(PART_OF_SPEECH_LABELS[entry.part_of_speech])}</Badge>
                  {entry.cefr_level && <Badge variant="outline">{entry.cefr_level.toUpperCase()}</Badge>}
                  {entry.topic && <Badge variant="outline">{entry.topic}</Badge>}
                </div>
                <p className="font-medium">{entry.meaning_vi}</p>
                {entry.definition_en && <p className="text-muted-foreground text-sm">{entry.definition_en}</p>}
                {entry.example && <p className="border-primary/40 border-l-4 pl-3 text-sm italic">{entry.example}</p>}
                {entry.synonyms.length > 0 && <p className="text-muted-foreground text-xs">{t("Synonyms: {synonyms}.", { synonyms: entry.synonyms.join(", ") })}</p>}
                {entry.antonyms.length > 0 && <p className="text-muted-foreground text-xs">{t("Opposites: {antonyms}.", { antonyms: entry.antonyms.join(", ") })}</p>}
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  )
}
