import { ArrowLeftIcon, PencilIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { designPath, routes } from "@/config/routes"
import { DesignViewer } from "@/features/designer/components/design-viewer"
import { KIND_LABELS } from "@/features/designer/model"
import { getDesign } from "@/features/designer/server/design-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Present design") }
}

export default async function DesignPreviewPage({ params }: PageProps<"/designs/[id]/preview">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.designPreview)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const design = await getDesign(await createClient(), id)
  if (!design) notFound()

  return (
    <>
      <Link href={routes.designs} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Lesson designer")}
      </Link>
      <PageHeader
        title={design.title}
        description={t("{value} · {length} page{value2} · arrow keys to move, Reveal shows hidden answers", { value: KIND_LABELS[design.kind], length: design.content.pages.length, value2: design.content.pages.length === 1 ? "" : "s" })}
        actions={
          can(user.permissions, "designs.write") ? (
            <Button variant="outline" asChild>
              <Link href={designPath(design.id)}>
                <PencilIcon aria-hidden /> {t("Edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <DesignViewer content={design.content} assets={design.assets} title={design.title} allowAnswers />
    </>
  )
}
