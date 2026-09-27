import type { Metadata } from "next"

import { Reveal } from "@/components/motion/reveal"
import { FilterChips } from "@/components/shared/filter-chips"
import { routes } from "@/config/routes"
import { ArticleCards, LessonCards, MaterialCards } from "@/features/site/components/resource-cards"
import { listPublicLessons, listPublicMaterials, listPublishedArticles } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

const TABS = ["lessons", "materials", "articles"] as const
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  lessons: "Sample lessons",
  materials: "Free materials",
  articles: "Articles",
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: t("Resources"),
    description: t("Sample lessons, free materials and articles from BSmart Academy teachers."),
    alternates: { canonical: routes.resources },
  }
}

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const t = await getT()
  const tab = enumParam(await searchParams, "tab", TABS) ?? "lessons"
  const db = await createClient()
  const [lessons, materials, articles] = await Promise.all([listPublicLessons(db), listPublicMaterials(db), listPublishedArticles(db)])
  const counts = { lessons: lessons.length, materials: materials.length, articles: articles.length }

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-6 pb-20 sm:px-6">
      <Reveal className="grid max-w-3xl gap-3">
        <p className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">{t("Resources")}</p>
        <h1 className="text-4xl font-semibold sm:text-5xl">{t("Learn something today")}</h1>
        <p className="text-muted-foreground text-lg">
          {t("Try sample lessons, open free materials and read tips from our teachers. Sign in to do exercises, save your progress and open premium content.")}
        </p>
      </Reveal>
      <FilterChips
        label={t("Resources")}
        chips={TABS.map((key) => ({
          href: key === "lessons" ? routes.resources : `${routes.resources}?tab=${key}`,
          label: t(TAB_LABELS[key]),
          active: tab === key,
          count: counts[key],
        }))}
      />
      {tab === "lessons" && <LessonCards lessons={lessons} />}
      {tab === "materials" && <MaterialCards materials={materials} />}
      {tab === "articles" && <ArticleCards articles={articles} />}
    </div>
  )
}
