import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes, wordSetPath } from "@/config/routes"
import { PracticePlayer } from "@/features/english/components/practice-player"
import { getSet, toPracticeWords } from "@/features/english/server/vocabulary-service"
import { ACTIVITIES, ACTIVITY_LABELS } from "@/features/english/skills"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Practise vocabulary") }
}

export default async function PracticePage({ params, searchParams }: PageProps<"/english/vocabulary/sets/[id]/practice">) {
  const t = await getT()
  await requireRouteAccess(routes.wordSetPractice)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const activity = enumParam(await searchParams, "activity", ACTIVITIES)
  if (!activity) redirect(wordSetPath(id))

  const set = await getSet(await createClient(), id)
  // Students only see published sets (RLS); the database also refuses results for drafts.
  if (!set || set.status !== "published") notFound()

  return (
    <>
      <Link href={wordSetPath(set.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {set.title}
      </Link>
      <PageHeader title={t(ACTIVITY_LABELS[activity].title)} description={t(ACTIVITY_LABELS[activity].description)} />
      {set.words.length < 4 ? (
        <p className="text-muted-foreground text-sm">{t("This set needs at least 4 words.")}</p>
      ) : (
        <div className="max-w-2xl">
          <PracticePlayer setId={set.id} activity={activity} words={toPracticeWords(set.words)} />
        </div>
      )}
    </>
  )
}
