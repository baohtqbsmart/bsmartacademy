import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { libraryMaterialPath, routes } from "@/config/routes"
import { MaterialForm } from "@/features/library/components/material-form"
import { toFolderNodes } from "@/features/library/folders"
import { getMaterial, listCatalogOptions, listFolders } from "@/features/library/server/library-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit material") }
}

export default async function EditMaterialPage({ params }: PageProps<"/library/[id]/edit">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.libraryEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const m = await getMaterial(db, id, user.id)
  const isAdmin = can(user.permissions, "library.write", ["all"])
  // Only its manager edits it (the database refuses anyone else anyway).
  if (!m || !(isAdmin || (m.scope === "personal" && m.owner_id === user.id))) notFound()
  const [options, folderRows] = await Promise.all([listCatalogOptions(db), listFolders(db)])

  return (
    <>
      <PageHeader title={t("Edit material")} description={t("{title} · the file itself cannot be replaced; upload a new material instead.", { title: m.title })} />
      <MaterialForm
        userId={m.owner_id}
        canManageAcademy={isAdmin}
        subjects={options.subjects}
        levels={options.levels}
        folders={toFolderNodes(folderRows)}
        cancelHref={libraryMaterialPath(m.id)}
        initial={{
          materialId: m.id,
          title: m.title,
          description: m.description,
          subjectId: m.subject_id ?? "",
          levelId: m.level_id ?? "",
          skill: m.skill ?? "",
          topic: m.topic ?? "",
          tags: m.tags.join(", "),
          folderId: m.folder_id ?? "",
          visibility: m.visibility,
          scope: m.scope,
        }}
      />
    </>
  )
}
