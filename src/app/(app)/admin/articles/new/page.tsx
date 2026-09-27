import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { ArticleForm } from "@/features/site/components/article-form"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New article") }
}

export default async function NewArticlePage() {
  const t = await getT()
  await requireRouteAccess(routes.adminArticleNew)
  return (
    <>
      <PageHeader title={t("New article")} description={t("Saved as a draft until you publish it.")} />
      <ArticleForm defaultValues={{ slug: "", title: "", excerpt: "", body: "", coverImagePath: null, status: "draft" }} />
    </>
  )
}
