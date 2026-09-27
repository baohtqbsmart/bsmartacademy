import type { MetadataRoute } from "next"
import { unstable_rethrow } from "next/navigation"

import { articlePath, programPath, publicLessonPath, resourcePath, routes } from "@/config/routes"
import { listPublicLessons, listPublicMaterials, listPublishedArticles } from "@/features/site/server/content-service"
import { listWebsiteSubjects } from "@/features/site/server/site-service"
import { getPublicEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

/** Public pages only: home, programmes, resources (public lessons, materials, articles), about, contact. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicEnv().NEXT_PUBLIC_SITE_URL
  const url = (path: string) => new URL(path, base).toString()
  let subjects: { code: string }[] = []
  let lessons: { slug: string; published_at: string | null }[] = []
  let materials: { id: string; updated_at: string }[] = []
  let articles: { slug: string; published_at: string | null }[] = []
  try {
    const db = await createClient()
    ;[subjects, lessons, materials, articles] = await Promise.all([
      listWebsiteSubjects(db),
      listPublicLessons(db),
      listPublicMaterials(db),
      listPublishedArticles(db),
    ])
  } catch (error) {
    // Let Next.js mark the route dynamic (it reads the request); log real failures.
    unstable_rethrow(error)
    console.error("[sitemap] could not list subjects", error)
  }
  return [
    { url: url(routes.home), changeFrequency: "weekly", priority: 1 },
    { url: url(routes.programs), changeFrequency: "weekly", priority: 0.9 },
    ...subjects.map((s) => ({ url: url(programPath(s.code)), changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: url(routes.resources), changeFrequency: "weekly", priority: 0.8 },
    ...lessons.map((l) => ({ url: url(publicLessonPath(l.slug)), lastModified: l.published_at ?? undefined, priority: 0.7 })),
    ...materials.map((m) => ({ url: url(resourcePath(m.id)), lastModified: m.updated_at, priority: 0.5 })),
    ...articles.map((a) => ({ url: url(articlePath(a.slug)), lastModified: a.published_at ?? undefined, priority: 0.7 })),
    { url: url(routes.about), changeFrequency: "monthly", priority: 0.6 },
    { url: url(routes.contact), changeFrequency: "monthly", priority: 0.6 },
  ]
}
