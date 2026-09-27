import { ExternalLinkIcon, Trash2Icon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Button } from "@/components/ui/button"
import { articlePath, routes } from "@/config/routes"
import { deleteArticleAction } from "@/features/site/actions"
import { ArticleForm } from "@/features/site/components/article-form"
import { getArticleForEdit } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit article") }
}

export default async function EditArticlePage({ params }: PageProps<"/admin/articles/[id]">) {
  const t = await getT()
  await requireRouteAccess(routes.adminArticleEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const article = await getArticleForEdit(await createClient(), id)
  if (!article) notFound()

  return (
    <>
      <PageHeader
        title={article.title}
        description={t("Edit article")}
        actions={
          <>
            {article.status === "published" && (
              <Button asChild variant="outline">
                <Link href={articlePath(article.slug)} target="_blank">
                  <ExternalLinkIcon aria-hidden /> {t("View on the website")}
                </Link>
              </Button>
            )}
            <ConfirmActionButton
              variant="ghost"
              title={t("Delete this article?")}
              description={t("It is removed from the website and cannot be restored.")}
              confirmLabel={t("Delete")}
              successMessage={t("Article deleted.")}
              destructive
              action={deleteArticleAction.bind(null, { id: article.id })}
            >
              <Trash2Icon aria-hidden /> {t("Delete")}
            </ConfirmActionButton>
          </>
        }
      />
      <ArticleForm
        defaultValues={{
          id: article.id,
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          coverImagePath: article.cover_image_path,
          status: article.status,
        }}
      />
    </>
  )
}
