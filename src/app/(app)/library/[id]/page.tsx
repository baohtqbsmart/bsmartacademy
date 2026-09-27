import { ArrowLeftIcon, PencilIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { libraryEditPath, routes } from "@/config/routes"
import { SKILL_LABELS } from "@/features/assignments/status"
import { FILE_KIND_LABELS, type FileKind } from "@/features/library/catalog"
import { ArchiveButton, DeleteMaterialButton, DownloadButton, FavoriteButton, MoveToFolder } from "@/features/library/components/material-controls"
import { MaterialPreview } from "@/features/library/components/material-preview"
import { SharePanel } from "@/features/library/components/share-panel"
import { folderPaths, toFolderNodes } from "@/features/library/folders"
import { getMaterial, listFolders, listShareTargets } from "@/features/library/server/library-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { formatFileSize } from "@/lib/uploads"

export const metadata: Metadata = { title: "Material" }

export default async function MaterialPage({ params }: PageProps<"/library/[id]">) {
  const user = await requireRouteAccess(routes.libraryMaterial)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  // RLS: 404 for anyone who may not read it (students: unless assigned/shared).
  const m = await getMaterial(db, id, user.id)
  if (!m) notFound()

  const staff = can(user.permissions, "library.read", ["all", "assigned"])
  const isAdmin = can(user.permissions, "library.write", ["all"])
  const canManage = isAdmin || (can(user.permissions, "library.write", ["own"]) && m.scope === "personal" && m.owner_id === user.id)
  const canDistribute = staff && (canManage || m.visibility === "staff")
  const [targets, folderRows] = await Promise.all([
    canDistribute ? listShareTargets(db, { all: isAdmin, teacherProfileId: user.id }) : Promise.resolve([]),
    canManage ? listFolders(db) : Promise.resolve([]),
  ])
  const moveTargets = folderPaths(toFolderNodes(folderRows).filter((f) => f.scope === m.scope && (m.scope === "academy" || f.ownerId === m.owner_id)))
  const kind = m.file_kind as FileKind

  const facts: [string, React.ReactNode][] = [
    ["Subject", m.subject?.name],
    ["Level", m.level?.name],
    ["Skill", m.skill ? SKILL_LABELS[m.skill] : null],
    ["Topic", m.topic],
    ["Author", m.owner_name || "—"],
    ["Created", formatDateTime(m.created_at)],
    ["File", `${FILE_KIND_LABELS[kind] ?? kind} · ${formatFileSize(m.size_bytes)} · ${m.file_name}`],
    ["Folder", staff ? m.folder?.name : null],
  ]

  return (
    <>
      <Link href={routes.library} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Material library
      </Link>
      <PageHeader
        title={m.title}
        description={m.scope === "academy" ? "Academy library" : `By ${m.owner_id === user.id ? "you" : m.owner_name}`}
        actions={
          <>
            <FavoriteButton materialId={m.id} favorite={m.favorite} />
            <DownloadButton materialId={m.id} />
            {canManage && (
              <Button variant="outline" size="sm" asChild>
                <Link href={libraryEditPath(m.id)}>
                  <PencilIcon aria-hidden /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />
      {m.archived_at && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          Archived {formatDateTime(m.archived_at)} — hidden from students and other teachers.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <MaterialPreview kind={kind} url={m.previewUrl} title={m.title} />
          {m.description && <p className="text-sm whitespace-pre-wrap">{m.description}</p>}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
                {facts
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-words">{value}</dd>
                    </div>
                  ))}
              </dl>
              {m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.tags.map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      #{t}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {staff && (
            <Card>
              <CardHeader>
                <CardTitle>Access</CardTitle>
                <CardDescription>
                  {m.scope === "academy" ? "Academy resource, managed by administrators. " : ""}
                  {m.visibility === "staff" ? "All teachers can find and use it." : "Only its manager and administrators can find it."} Students see it only where it is assigned.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid gap-1">
                  <span className="font-medium">Assigned to</span>
                  {m.classes.length === 0 && m.students.length === 0 ? (
                    <span className="text-muted-foreground">No class or student yet.</span>
                  ) : (
                    <ul className="grid gap-0.5">
                      {m.classes.map((c) => (
                        <li key={c.class_id}>
                          {c.class?.name ?? "Class"} <span className="text-muted-foreground text-xs">by {c.shared_by_name || "staff"}</span>
                        </li>
                      ))}
                      {m.students.map((s) => (
                        <li key={s.student_id}>
                          {s.student?.full_name ?? "Student"} <span className="text-muted-foreground text-xs">(student) by {s.shared_by_name || "staff"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {canDistribute && (
                  <SharePanel
                    materialId={m.id}
                    canManage={canManage}
                    visibility={m.visibility}
                    targets={targets}
                    classIds={m.classes.map((c) => c.class_id)}
                    studentIds={m.students.map((s) => s.student_id)}
                    archived={Boolean(m.archived_at)}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Manage</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <MoveToFolder materialId={m.id} folderId={m.folder_id} folders={moveTargets} />
                <div className="flex flex-wrap gap-2">
                  <ArchiveButton materialId={m.id} archived={Boolean(m.archived_at)} />
                  <DeleteMaterialButton materialId={m.id} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
