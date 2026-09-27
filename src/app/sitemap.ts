import type { MetadataRoute } from "next"
import { unstable_rethrow } from "next/navigation"

import { programPath, routes } from "@/config/routes"
import { listWebsiteSubjects } from "@/features/site/server/site-service"
import { getPublicEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

/** Public pages only: home, programmes (one per subject on the website), about, contact. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicEnv().NEXT_PUBLIC_SITE_URL
  const url = (path: string) => new URL(path, base).toString()
  let subjects: { code: string }[] = []
  try {
    subjects = await listWebsiteSubjects(await createClient())
  } catch (error) {
    // Let Next.js mark the route dynamic (it reads the request); log real failures.
    unstable_rethrow(error)
    console.error("[sitemap] could not list subjects", error)
  }
  return [
    { url: url(routes.home), changeFrequency: "weekly", priority: 1 },
    { url: url(routes.programs), changeFrequency: "weekly", priority: 0.9 },
    ...subjects.map((s) => ({ url: url(programPath(s.code)), changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: url(routes.about), changeFrequency: "monthly", priority: 0.6 },
    { url: url(routes.contact), changeFrequency: "monthly", priority: 0.6 },
  ]
}
