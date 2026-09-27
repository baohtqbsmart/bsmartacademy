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

export const metadata: Metadata = { title: "Present design" }

export default async function DesignPreviewPage({ params }: PageProps<"/designs/[id]/preview">) {
  const user = await requireRouteAccess(routes.designPreview)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const design = await getDesign(await createClient(), id)
  if (!design) notFound()

  return (
    <>
      <Link href={routes.designs} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Lesson designer
      </Link>
      <PageHeader
        title={design.title}
        description={`${KIND_LABELS[design.kind]} · ${design.content.pages.length} page${design.content.pages.length === 1 ? "" : "s"} · arrow keys to move, Reveal shows hidden answers`}
        actions={
          can(user.permissions, "designs.write") ? (
            <Button variant="outline" asChild>
              <Link href={designPath(design.id)}>
                <PencilIcon aria-hidden /> Edit
              </Link>
            </Button>
          ) : undefined
        }
      />
      <DesignViewer content={design.content} assets={design.assets} title={design.title} allowAnswers />
    </>
  )
}
