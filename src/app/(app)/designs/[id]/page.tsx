import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { routes } from "@/config/routes"
import { DesignEditor } from "@/features/designer/components/design-editor"
import { getDesign } from "@/features/designer/server/design-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Lesson designer") }
}

export default async function DesignEditorPage({ params }: PageProps<"/designs/[id]">) {
  await requireRouteAccess(routes.designEditor)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  // RLS: teachers get only their own designs; admins any.
  const design = await getDesign(await createClient(), id)
  if (!design) notFound()

  return (
    <DesignEditor
      key={`${design.id}-${design.version}`}
      design={{ id: design.id, title: design.title, kind: design.kind, content: design.content, version: design.version, share_token: design.share_token }}
      initialAssets={design.assets}
    />
  )
}
