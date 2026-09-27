import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { Reveal } from "@/components/motion/reveal"
import { Prose } from "@/components/shared/prose"
import { Badge } from "@/components/ui/badge"
import { canAccessRoute } from "@/config/access"
import { lessonPath, publicLessonPath, routes } from "@/config/routes"
import { SKILL_NAMES } from "@/features/analytics/metrics"
import { AccessBadge } from "@/features/site/components/resource-cards"
import { ShareButtons } from "@/features/site/components/share-buttons"
import { UnlockCta } from "@/features/site/components/unlock-cta"
import { CommentsSection } from "@/features/comments/components/comments-section"
import { getPublicLesson } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { getCurrentUser } from "@/lib/auth/session"
import { getPublicEnv } from "@/lib/env"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

const load = cache(async (slug: string) => getPublicLesson(await createClient(), decodeURIComponent(slug)))

export async function generateMetadata({ params }: PageProps<"/lessons/[slug]">): Promise<Metadata> {
  const t = await getT()
  const lesson = await load((await params).slug)
  if (!lesson) return { title: t("Page not found") }
  const description = lesson.summary || lesson.body?.slice(0, 160) || t("A sample lesson from BSmart Academy.")
  return {
    title: lesson.title,
    description,
    alternates: { canonical: publicLessonPath(lesson.slug) },
    openGraph: { type: "article", title: `${lesson.title} – BSmart Academy`, description, publishedTime: lesson.published_at ?? undefined },
  }
}

export default async function PublicLessonPage({ params }: PageProps<"/lessons/[slug]">) {
  const t = await getT()
  const [lesson, user] = await Promise.all([load((await params).slug), getCurrentUser()])
  if (!lesson) notFound()

  const url = new URL(publicLessonPath(lesson.slug), getPublicEnv().NEXT_PUBLIC_SITE_URL).toString()
  const fullHref = user && canAccessRoute(user.permissions, routes.lessonDetail) ? lessonPath(lesson.id) : null
  const mistakes = Array.isArray(lesson.common_mistakes) ? (lesson.common_mistakes as { incorrect?: string; correct?: string; note?: string }[]) : []
  const skill = SKILL_NAMES[lesson.skill as keyof typeof SKILL_NAMES] ?? lesson.skill
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: lesson.title,
    description: lesson.summary ?? undefined,
    educationalLevel: lesson.cefr_level ? `CEFR ${lesson.cefr_level.toUpperCase()}` : undefined,
    inLanguage: "en",
    isAccessibleForFree: lesson.access === "public",
    provider: { "@type": "EducationalOrganization", name: "BSmart Academy" },
    url,
  }

  return (
    <article className="mx-auto grid max-w-3xl gap-8 px-4 pt-6 pb-20 sm:px-6">
      {/* Structured data for search engines (JSON only, "<" escaped). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href={routes.resources} className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Resources")}
      </Link>

      <Reveal className="grid gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{t(skill)}</Badge>
          {lesson.cefr_level && <Badge variant="outline">{lesson.cefr_level.toUpperCase()}</Badge>}
          {lesson.topic && <Badge variant="outline">{lesson.topic}</Badge>}
          <AccessBadge access={lesson.access} />
        </div>
        <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">{lesson.title}</h1>
        {lesson.summary && <p className="text-muted-foreground text-lg">{lesson.summary}</p>}
        <p className="text-muted-foreground text-sm">
          {lesson.author_name}
          {lesson.published_at ? ` · ${formatDate(lesson.published_at)}` : ""}
        </p>
        <ShareButtons url={url} title={lesson.title} />
      </Reveal>

      {lesson.mediaUrl && (
        <div className="overflow-hidden rounded-2xl border bg-black/5">
          {lesson.mediaKind === "video" && <video src={lesson.mediaUrl} controls preload="metadata" className="aspect-video w-full bg-black" />}
          {lesson.mediaKind === "audio" && <audio src={lesson.mediaUrl} controls preload="metadata" className="w-full p-4" />}
          {lesson.mediaKind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={lesson.mediaUrl} alt="" className="w-full" />
          )}
        </div>
      )}

      <div className="relative">
        <Prose text={lesson.body} />
        {lesson.body_truncated && <div aria-hidden className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t" />}
      </div>

      {lesson.form && (
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold">{t("Structure")}</h2>
          <Prose text={lesson.form} className="bg-muted/50 rounded-xl p-4 font-mono text-sm" />
        </section>
      )}
      {lesson.usage && (
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold">{t("Usage")}</h2>
          <Prose text={lesson.usage} />
        </section>
      )}
      {lesson.examples.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold">{t("Examples")}</h2>
          <ul className="grid gap-2">
            {lesson.examples.map((example) => (
              <li key={example} className="border-primary/40 border-l-4 py-1 pl-4 italic">
                {example}
              </li>
            ))}
          </ul>
        </section>
      )}
      {mistakes.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold">{t("Common mistakes")}</h2>
          <ul className="grid gap-2">
            {mistakes.map((m, i) => (
              <li key={i} className="grid gap-1 rounded-xl border p-3 text-sm">
                <span className="text-destructive">✗ {m.incorrect}</span>
                <span className="text-success">✓ {m.correct}</span>
                {m.note && <span className="text-muted-foreground">{m.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <UnlockCta
        signedIn={Boolean(user)}
        fullHref={fullHref}
        title={lesson.body_truncated ? undefined : t("Practise this lesson")}
        text={lesson.body_truncated ? undefined : t("Sign in to do the exercises, get feedback and keep your progress.")}
      />

      <CommentsSection target={{ lessonId: lesson.id }} returnTo={publicLessonPath(lesson.slug)} />
    </article>
  )
}
