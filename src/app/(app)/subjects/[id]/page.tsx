import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { COURSE_STATUS } from "@/config/labels"
import { coursePath, routes } from "@/config/routes"
import {
  archiveLevelAction,
  archiveSubjectAction,
  restoreLevelAction,
  restoreSubjectAction,
} from "@/features/subjects/actions"
import { LevelDialog, SubjectDialog } from "@/features/subjects/components/subject-dialogs"
import { getSubject } from "@/features/subjects/server/subject-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Subject" }

export default async function SubjectPage({ params }: PageProps<"/subjects/[id]">) {
  await requireRouteAccess(routes.subjectDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const subject = await getSubject(await createClient(), id)
  if (!subject) notFound()

  const levels = [...subject.levels].sort((a, b) => a.sort_order - b.sort_order)
  const levelName = new Map(levels.map((l) => [l.id, l.name]))
  const courses = subject.courses.filter((c) => !c.deleted_at)
  const nextOrder = (levels.at(-1)?.sort_order ?? 0) + 1

  return (
    <>
      <Link href={routes.subjects} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Subjects
      </Link>
      <PageHeader
        title={subject.name}
        description={subject.description || `Subject code ${subject.code}`}
        actions={
          <>
            {subject.deleted_at && <Badge variant="destructive">Archived</Badge>}
            <SubjectDialog
              initial={{ subjectId: subject.id, code: subject.code, name: subject.name, description: subject.description }}
            />
            {subject.deleted_at ? (
              <ConfirmActionButton
                title="Restore subject?"
                description="It will be available for new courses again."
                confirmLabel="Restore"
                successMessage="Subject restored."
                action={restoreSubjectAction.bind(null, { subjectId: subject.id })}
              >
                <ArchiveRestoreIcon aria-hidden /> Restore
              </ConfirmActionButton>
            ) : (
              <ConfirmActionButton
                title="Archive subject?"
                description="Only possible when no live course uses it. Archived subjects cannot be used for new courses."
                confirmLabel="Archive"
                successMessage="Subject archived."
                destructive
                action={archiveSubjectAction.bind(null, { subjectId: subject.id })}
              >
                <ArchiveIcon aria-hidden /> Archive
              </ConfirmActionButton>
            )}
          </>
        }
      />

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Levels</h2>
          <LevelDialog subjectId={subject.id} nextOrder={nextOrder} />
        </div>
        <SimpleTable
          rows={levels}
          rowKey={(l) => l.id}
          empty="No levels yet. Levels let courses be grouped from beginner to advanced."
          columns={[
            { header: "Order", cell: (l) => l.sort_order, className: "w-16" },
            { header: "Code", cell: (l) => <span className="font-mono text-xs">{l.code}</span> },
            {
              header: "Level",
              cell: (l) => (
                <span className="flex items-center gap-2">
                  {l.name}
                  {l.deleted_at && <Badge variant="outline">Archived</Badge>}
                </span>
              ),
            },
            {
              header: "",
              key: "actions",
              className: "text-right",
              cell: (l) => (
                <div className="flex justify-end gap-1">
                  <LevelDialog
                    subjectId={subject.id}
                    nextOrder={nextOrder}
                    initial={{ levelId: l.id, code: l.code, name: l.name, sortOrder: String(l.sort_order) }}
                  />
                  <ConfirmActionButton
                    variant="ghost"
                    title={l.deleted_at ? "Restore level?" : "Archive level?"}
                    description={
                      l.deleted_at
                        ? "It will be available for courses again."
                        : "Only possible when no live course uses this level."
                    }
                    confirmLabel={l.deleted_at ? "Restore" : "Archive"}
                    successMessage={l.deleted_at ? "Level restored." : "Level archived."}
                    destructive={!l.deleted_at}
                    action={(l.deleted_at ? restoreLevelAction : archiveLevelAction).bind(null, { levelId: l.id })}
                  >
                    {l.deleted_at ? "Restore" : "Archive"}
                  </ConfirmActionButton>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Courses</h2>
        <SimpleTable
          rows={courses}
          rowKey={(c) => c.id}
          empty="No courses use this subject yet."
          columns={[
            { header: "Code", cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
            {
              header: "Course",
              cell: (c) => (
                <Link href={coursePath(c.id)} className="font-medium hover:underline">
                  {c.name}
                </Link>
              ),
            },
            { header: "Level", cell: (c) => (c.level_id ? levelName.get(c.level_id) ?? "—" : "—") },
            {
              header: "Status",
              cell: (c) => <Badge variant={COURSE_STATUS[c.status].variant}>{COURSE_STATUS[c.status].label}</Badge>,
            },
          ]}
        />
      </section>
    </>
  )
}
