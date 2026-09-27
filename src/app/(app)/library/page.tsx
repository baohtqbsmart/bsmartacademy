import { FolderOpenIcon, UploadIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { Pagination } from "@/components/shared/pagination"
import { TabNav } from "@/components/shared/tab-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { ASSIGNMENT_SKILLS, SKILL_LABELS } from "@/features/assignments/status"
import { FILE_KIND_LABELS, FILE_KINDS, PAGE_SIZE, SORT_KEYS, SORTS, VIEW_LABELS, VIEWS, type LibraryView } from "@/features/library/catalog"
import { FolderSidebar } from "@/features/library/components/folder-sidebar"
import { MaterialList } from "@/features/library/components/material-list"
import { toFolderNodes } from "@/features/library/folders"
import { listCatalogOptions, listFolders, listMaterials } from "@/features/library/server/library-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam, firstParam, uuidParam, withParams } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Material library" }

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const user = await requireRouteAccess(routes.library)
  const params = await searchParams
  const staff = can(user.permissions, "library.read", ["all", "assigned"])
  const canWrite = can(user.permissions, "library.write")
  const canManageAcademy = can(user.permissions, "library.write", ["all"])

  // Students and parents: what is assigned or shared to them, and favourites.
  const views: LibraryView[] = staff ? (canWrite ? ["all", "mine", "academy", "favorites", "archived"] : ["all", "academy", "favorites"]) : ["all", "favorites"]
  const view = enumParam(params, "view", VIEWS)
  const active: LibraryView = view && views.includes(view) ? view : "all"
  const q = firstParam(params, "q")?.trim().slice(0, 100) || undefined
  const subjectId = uuidParam(params, "subject")
  const levelId = subjectId ? uuidParam(params, "level") : undefined
  const skill = enumParam(params, "skill", ASSIGNMENT_SKILLS)
  const kind = enumParam(params, "kind", FILE_KINDS)
  const sort = enumParam(params, "sort", SORT_KEYS) ?? "newest"
  const folderParam = firstParam(params, "folder")
  const folderId = staff ? (folderParam === "root" ? "root" : uuidParam(params, "folder")) : undefined
  const page = Math.max(1, Math.min(1000, Number(firstParam(params, "page")) || 1))

  const db = await createClient()
  const [{ materials, total }, options, folderRows] = await Promise.all([
    listMaterials(db, { view: active, userId: user.id, q, subjectId, levelId, skill, kind, folderId, sort, page }),
    listCatalogOptions(db),
    staff ? listFolders(db) : Promise.resolve([]),
  ])

  const current = { view: active === "all" ? undefined : active, q, subject: subjectId, level: levelId, skill, kind, sort: sort === "newest" ? undefined : sort, folder: folderId }
  const href = (changes: Record<string, string | undefined>) => withParams(routes.library, { ...current, page: undefined, ...changes })
  const filtered = Boolean(q || subjectId || skill || kind || folderId)

  const list = (
    <div className="grid min-w-0 content-start gap-4">
      <ListFilters
        basePath={routes.library}
        values={{ q, subject: subjectId, level: levelId, skill, kind, sort: current.sort }}
        preserve={{ view: current.view, folder: folderId }}
        searchPlaceholder="Search title, description, topic or tag"
        filters={[
          { param: "subject", allLabel: "All subjects", options: options.subjects.map((s) => ({ value: s.id, label: s.name })) },
          ...(subjectId ? [{ param: "level", allLabel: "All levels", options: options.levels.filter((l) => l.subject_id === subjectId).map((l) => ({ value: l.id, label: l.name })) }] : []),
          { param: "skill", allLabel: "All skills", options: ASSIGNMENT_SKILLS.map((s) => ({ value: s, label: SKILL_LABELS[s] })) },
          { param: "kind", allLabel: "All file types", options: FILE_KINDS.map((k) => ({ value: k, label: FILE_KIND_LABELS[k] })) },
          { param: "sort", allLabel: "Sort", defaultValue: "newest", options: SORT_KEYS.map((k) => ({ value: k, label: SORTS[k].label })) },
        ]}
      />
      {materials.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FolderOpenIcon}
              title={filtered ? "No materials match" : staff ? "No materials here yet" : "Nothing has been shared with you yet"}
              description={!staff && !filtered ? "Your teachers' materials appear here when they assign them to your class." : undefined}
              action={
                canWrite && !filtered ? (
                  <Button asChild>
                    <Link href={routes.libraryNew}>
                      <UploadIcon aria-hidden /> Upload material
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <MaterialList materials={materials} userId={user.id} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(p) => withParams(routes.library, { ...current, page: p > 1 ? String(p) : undefined })} />
        </>
      )}
    </div>
  )

  return (
    <>
      <PageHeader
        title="Material library"
        description={staff ? "Worksheets, slides, pictures, recordings and videos — upload once, use in every class." : "Materials your teachers have shared with you."}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={folderId && folderId !== "root" ? `${routes.libraryNew}?folder=${folderId}` : routes.libraryNew}>
                <UploadIcon aria-hidden /> Upload
              </Link>
            </Button>
          )
        }
      />
      <TabNav
        label="Library views"
        active={active}
        tabs={views.map((v) => ({ value: v, label: v === "all" && !staff ? "Shared with me" : VIEW_LABELS[v], href: href({ view: v === "all" ? undefined : v }) }))}
      />
      {staff ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
          <aside className="lg:border-r lg:pr-4">
            <FolderSidebar folders={toFolderNodes(folderRows)} current={folderId} hrefFor={(f) => href({ folder: f })} userId={user.id} canManageAcademy={canManageAcademy} />
          </aside>
          {list}
        </div>
      ) : (
        list
      )}
    </>
  )
}
