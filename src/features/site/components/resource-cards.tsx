import {
  ArrowRightIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  LockKeyholeIcon,
  MusicIcon,
  PlayCircleIcon,
  PresentationIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { SubjectArt } from "@/components/brand/subject-art"
import { Stagger, StaggerItem } from "@/components/motion/reveal"
import { Badge } from "@/components/ui/badge"
import { articlePath, publicLessonPath, resourcePath } from "@/config/routes"
import { SKILL_NAMES } from "@/features/analytics/metrics"
import type { ArticleListItem, PublicLessonItem, PublicMaterialItem } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { formatDate } from "@/lib/format"
import { publicMediaUrl } from "@/lib/public-media"
import { formatFileSize } from "@/lib/uploads"

const FILE_ICONS: Record<string, LucideIcon> = {
  pdf: FileTextIcon,
  document: FileTextIcon,
  presentation: PresentationIcon,
  image: ImageIcon,
  audio: MusicIcon,
  video: VideoIcon,
}

const SKILL_ICON: Record<string, string> = {
  grammar: "book",
  reading: "book",
  listening: "music",
  speaking: "languages",
  writing: "palette",
  pronunciation: "languages",
}

export async function AccessBadge({ access }: { access: "members" | "preview" | "public" }) {
  const t = await getT()
  return access === "public" ? (
    <Badge className="bg-success text-success-foreground">{t("Free")}</Badge>
  ) : (
    <Badge variant="outline" className="gap-1">
      <LockKeyholeIcon className="size-3" aria-hidden /> {access === "preview" ? t("Preview") : t("Members")}
    </Badge>
  )
}

export async function LessonCards({ lessons }: { lessons: PublicLessonItem[] }) {
  const t = await getT()
  if (lessons.length === 0) return <EmptyNote text={t("Sample lessons will be published here soon.")} />
  return (
    <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {lessons.map((lesson) => (
        <StaggerItem key={lesson.slug}>
          <Link href={publicLessonPath(lesson.slug)} className="lift group bg-card flex h-full flex-col overflow-hidden rounded-2xl border">
            <SubjectArt icon={SKILL_ICON[lesson.skill] ?? "languages"} className="aspect-[16/8]" />
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{t(SKILL_NAMES[lesson.skill as keyof typeof SKILL_NAMES] ?? lesson.skill)}</Badge>
                {lesson.cefr_level && <Badge variant="outline">{lesson.cefr_level.toUpperCase()}</Badge>}
                <AccessBadge access={lesson.access} />
                {lesson.has_media && <PlayCircleIcon className="text-primary size-4" aria-label={t("Includes media")} />}
              </div>
              <h3 className="font-heading text-xl leading-snug font-semibold">{lesson.title}</h3>
              {lesson.summary && <p className="text-muted-foreground line-clamp-3 text-sm">{lesson.summary}</p>}
              <ReadMore label={t("Start learning")} />
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  )
}

export async function MaterialCards({ materials }: { materials: PublicMaterialItem[] }) {
  const t = await getT()
  if (materials.length === 0) return <EmptyNote text={t("Free materials will be published here soon.")} />
  return (
    <Stagger inView className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {materials.map((material) => {
        const Icon = FILE_ICONS[material.file_kind] ?? FileIcon
        return (
          <StaggerItem key={material.id}>
            <Link href={resourcePath(material.id)} className="lift group bg-card flex h-full gap-4 rounded-2xl border p-5">
              <span className="bg-brand-cream text-primary flex size-12 shrink-0 items-center justify-center rounded-xl dark:bg-[#2a2018]">
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="grid min-w-0 content-start gap-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <AccessBadge access={material.access} />
                  {material.subject_name && <Badge variant="secondary">{material.subject_name}</Badge>}
                </span>
                <span className="font-heading text-lg leading-snug font-semibold">{material.title}</span>
                {material.description && <span className="text-muted-foreground line-clamp-2 text-sm">{material.description}</span>}
                <span className="text-muted-foreground text-xs uppercase">
                  {material.file_kind} · {formatFileSize(Number(material.size_bytes))}
                </span>
              </span>
            </Link>
          </StaggerItem>
        )
      })}
    </Stagger>
  )
}

export async function ArticleCards({ articles }: { articles: ArticleListItem[] }) {
  const t = await getT()
  if (articles.length === 0) return <EmptyNote text={t("Articles will be published here soon.")} />
  return (
    <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <StaggerItem key={article.id}>
          <Link href={articlePath(article.slug)} className="lift group bg-card flex h-full flex-col overflow-hidden rounded-2xl border">
            <SubjectArt icon="book" imageUrl={publicMediaUrl(article.cover_image_path)} className="aspect-[16/9]" />
            <div className="flex flex-1 flex-col gap-2 p-5">
              <span className="text-muted-foreground text-xs">
                {formatDate(article.published_at)}
                {article.author_name ? ` · ${article.author_name}` : ""}
              </span>
              <h3 className="font-heading text-xl leading-snug font-semibold">{article.title}</h3>
              {article.excerpt && <p className="text-muted-foreground line-clamp-3 text-sm">{article.excerpt}</p>}
              <ReadMore label={t("Read the article")} />
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  )
}

function ReadMore({ label }: { label: string }) {
  return (
    <span className="text-primary mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold">
      {label}
      <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
    </span>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-muted-foreground rounded-2xl border border-dashed p-10 text-center">{text}</p>
}
