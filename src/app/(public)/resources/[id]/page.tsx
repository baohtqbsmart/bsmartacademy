import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { z } from "zod"

import { Reveal } from "@/components/motion/reveal"
import { NoCopy } from "@/components/shared/no-copy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { canAccessRoute } from "@/config/access"
import { libraryMaterialPath, resourcePath, routes } from "@/config/routes"
import { AccessBadge } from "@/features/site/components/resource-cards"
import { ShareButtons } from "@/features/site/components/share-buttons"
import { UnlockCta } from "@/features/site/components/unlock-cta"
import { getPublicMaterial } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { getCurrentUser } from "@/lib/auth/session"
import { getPublicEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { formatFileSize } from "@/lib/uploads"

const load = cache(async (id: string) => (z.uuid().safeParse(id).success ? getPublicMaterial(await createClient(), id) : null))

export async function generateMetadata({ params }: PageProps<"/resources/[id]">): Promise<Metadata> {
  const t = await getT()
  const material = await load((await params).id)
  if (!material) return { title: t("Page not found") }
  return {
    title: material.title,
    description: material.description || t("A learning material from BSmart Academy."),
    alternates: { canonical: resourcePath(material.id) },
  }
}

export default async function PublicMaterialPage({ params }: PageProps<"/resources/[id]">) {
  const t = await getT()
  const [material, user] = await Promise.all([load((await params).id), getCurrentUser()])
  if (!material) notFound()
  const url = new URL(resourcePath(material.id), getPublicEnv().NEXT_PUBLIC_SITE_URL).toString()
  const fullHref = user && canAccessRoute(user.permissions, routes.libraryMaterial) ? libraryMaterialPath(material.id) : null
  // Visitors and website members may read a free material here but not keep it.
  const readOnly = !fullHref
  const Wrapper = readOnly ? NoCopy : "div"

  return (
    <article className="mx-auto grid max-w-4xl gap-8 px-4 pt-6 pb-20 sm:px-6">
      <Link href={`${routes.resources}?tab=materials`} className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Resources")}
      </Link>
      <Reveal className="grid gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <AccessBadge access={material.access} />
          {material.subject_name && <Badge variant="secondary">{material.subject_name}</Badge>}
          {material.topic && <Badge variant="outline">{material.topic}</Badge>}
          <span className="text-muted-foreground text-xs uppercase">
            {material.file_kind} · {formatFileSize(Number(material.size_bytes))}
          </span>
        </div>
        <h1 className="text-4xl leading-tight font-semibold">{material.title}</h1>
        {material.description && <p className="text-muted-foreground text-lg whitespace-pre-line">{material.description}</p>}
        <ShareButtons url={url} title={material.title} />
      </Reveal>

      {material.fileUrl ? (
        <div className="grid gap-3">
          <Wrapper className="overflow-hidden rounded-2xl border">
            {material.file_kind === "pdf" && (
              <iframe src={readOnly ? `${material.fileUrl}#toolbar=0&navpanes=0` : material.fileUrl} title={material.title} className="h-[75vh] w-full" />
            )}
            {material.file_kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={material.fileUrl} alt={material.title} className="w-full" draggable={!readOnly} />
            )}
            {material.file_kind === "video" && (
              <video src={material.fileUrl} controls preload="metadata" controlsList={readOnly ? "nodownload" : undefined} className="aspect-video w-full bg-black" />
            )}
            {material.file_kind === "audio" && (
              <audio src={material.fileUrl} controls preload="metadata" controlsList={readOnly ? "nodownload" : undefined} className="w-full p-4" />
            )}
            {!["pdf", "image", "video", "audio"].includes(material.file_kind) && (
              <p className="text-muted-foreground p-8 text-center text-sm">
                {readOnly ? t("This file can be opened by BSmart Academy learners.") : t("No preview for Word or PowerPoint files — download it to open.")}
              </p>
            )}
          </Wrapper>
          {!readOnly && (
            <div>
              <Button asChild variant="outline">
                <a href={material.fileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden /> {t("Open in a new tab")}
                </a>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <UnlockCta
          signedIn={Boolean(user)}
          fullHref={fullHref}
          title={t("Sign in to open this material")}
          text={t("Premium materials are for BSmart Academy learners.")}
        />
      )}
    </article>
  )
}
