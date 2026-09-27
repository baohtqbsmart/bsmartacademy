import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { Reveal } from "@/components/motion/reveal"
import { Prose } from "@/components/shared/prose"
import { articlePath, routes } from "@/config/routes"
import { CommentsSection } from "@/features/comments/components/comments-section"
import { ArticleCards } from "@/features/site/components/resource-cards"
import { ShareButtons } from "@/features/site/components/share-buttons"
import { getPublishedArticle, listPublishedArticles } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { getPublicEnv } from "@/lib/env"
import { formatDate } from "@/lib/format"
import { publicMediaUrl } from "@/lib/public-media"
import { createClient } from "@/lib/supabase/server"

const load = cache(async (slug: string) => getPublishedArticle(await createClient(), decodeURIComponent(slug)))

export async function generateMetadata({ params }: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const t = await getT()
  const article = await load((await params).slug)
  if (!article) return { title: t("Page not found") }
  const cover = publicMediaUrl(article.cover_image_path)
  return {
    title: article.title,
    description: article.excerpt || article.body.slice(0, 160),
    alternates: { canonical: articlePath(article.slug) },
    openGraph: {
      type: "article",
      title: `${article.title} – BSmart Academy`,
      description: article.excerpt || undefined,
      publishedTime: article.published_at ?? undefined,
      ...(cover ? { images: [cover] } : {}),
    },
  }
}

export default async function ArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const t = await getT()
  const article = await load((await params).slug)
  if (!article) notFound()
  const more = (await listPublishedArticles(await createClient(), 4)).filter((a) => a.id !== article.id).slice(0, 3)
  const url = new URL(articlePath(article.slug), getPublicEnv().NEXT_PUBLIC_SITE_URL).toString()
  const cover = publicMediaUrl(article.cover_image_path)

  return (
    <div className="mx-auto grid max-w-7xl gap-16 px-4 pt-6 pb-20 sm:px-6">
      <article className="mx-auto grid w-full max-w-3xl gap-8">
        <Link href={`${routes.resources}?tab=articles`} className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm">
          <ArrowLeftIcon className="size-4" aria-hidden /> {t("Articles")}
        </Link>
        <Reveal className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            {formatDate(article.published_at)}
            {article.author_name ? ` · ${article.author_name}` : ""}
          </p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">{article.title}</h1>
          {article.excerpt && <p className="text-muted-foreground text-lg">{article.excerpt}</p>}
          <ShareButtons url={url} title={article.title} />
        </Reveal>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- public storage URL chosen by staff
          <img src={cover} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
        )}
        <Prose text={article.body} className="text-lg" />
        <CommentsSection target={{ articleId: article.id }} returnTo={articlePath(article.slug)} />
      </article>
      {more.length > 0 && (
        <section className="grid gap-6">
          <h2 className="text-2xl font-semibold">{t("More articles")}</h2>
          <ArticleCards articles={more} />
        </section>
      )}
    </div>
  )
}
