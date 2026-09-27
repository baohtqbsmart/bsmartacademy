import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { MaterialForm } from "@/features/library/components/material-form"
import { toFolderNodes } from "@/features/library/folders"
import { listCatalogOptions, listFolders } from "@/features/library/server/library-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Upload material") }
}

export default async function NewMaterialPage({ searchParams }: PageProps<"/library/new">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.libraryNew)
  const db = await createClient()
  const [options, folderRows] = await Promise.all([listCatalogOptions(db), listFolders(db)])
  const folders = toFolderNodes(folderRows)
  const requestedId = uuidParam(await searchParams, "folder")
  const requested = folders.find((f) => f.id === requestedId)
  const canManageAcademy = can(user.permissions, "library.write", ["all"])
  const scope = requested?.scope === "academy" && canManageAcademy ? "academy" : "personal"
  const folderId = requested && (scope === "academy" || requested.ownerId === user.id) ? requested.id : ""

  return (
    <>
      <PageHeader title={t("Upload material")} description={t("Add a file to the library; assign it to classes or share it with students afterwards.")} />
      <MaterialForm
        userId={user.id}
        canManageAcademy={canManageAcademy}
        subjects={options.subjects}
        levels={options.levels}
        folders={folders}
        cancelHref={routes.library}
        initial={{ title: "", description: "", subjectId: "", levelId: "", skill: "", topic: "", tags: "", folderId, visibility: "private", scope }}
      />
    </>
  )
}
