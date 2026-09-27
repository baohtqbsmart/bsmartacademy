import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { DesignViewer } from "@/features/designer/components/design-viewer"
import { KIND_LABELS } from "@/features/designer/model"
import { getSharedDesign } from "@/features/designer/server/design-service"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Shared design") }
}

/**
 * A design shared by link. Open to every signed-in user: the token is the key,
 * checked by shared_design() in the database; a stopped or reset link is a 404.
 */
export default async function SharedDesignPage({ params }: PageProps<"/designs/shared/[token]">) {
  const t = await getT()
  await requireUser()
  const { token } = await params
  if (!z.uuid().safeParse(token).success) notFound()
  const design = await getSharedDesign(await createClient(), token)
  if (!design) notFound()

  return (
    <>
      <PageHeader title={design.title} description={t("{value} shared by {value2} · read-only", { value: KIND_LABELS[design.kind], value2: design.owner_name || "a teacher" })} />
      <DesignViewer content={design.content} assets={design.assets} title={design.title} allowAnswers={false} />
    </>
  )
}
