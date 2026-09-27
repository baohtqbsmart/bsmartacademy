import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { DesignViewer } from "@/features/designer/components/design-viewer"
import { KIND_LABELS } from "@/features/designer/model"
import { getSharedDesign } from "@/features/designer/server/design-service"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Shared design" }

/**
 * A design shared by link. Open to every signed-in user: the token is the key,
 * checked by shared_design() in the database; a stopped or reset link is a 404.
 */
export default async function SharedDesignPage({ params }: PageProps<"/designs/shared/[token]">) {
  await requireUser()
  const { token } = await params
  if (!z.uuid().safeParse(token).success) notFound()
  const design = await getSharedDesign(await createClient(), token)
  if (!design) notFound()

  return (
    <>
      <PageHeader title={design.title} description={`${KIND_LABELS[design.kind]} shared by ${design.owner_name || "a teacher"} · read-only`} />
      <DesignViewer content={design.content} assets={design.assets} title={design.title} allowAnswers={false} />
    </>
  )
}
