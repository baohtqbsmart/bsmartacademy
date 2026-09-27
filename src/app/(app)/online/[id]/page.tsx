import {
  ArrowLeftIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  FileIcon,
  LinkIcon,
  NotebookPenIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, classAttendancePath, onlineEditPath, routes } from "@/config/routes"
import { FileUploader } from "@/features/assignments/components/file-uploader"
import {
  AddLinkMaterialDialog,
  JoinButton,
  LinkHomeworkDialog,
  MaterialActions,
  SessionStatusControls,
  TeachingNotesEditor,
  UnlinkHomeworkButton,
} from "@/features/online/components/session-controls"
import { SessionStatusBadge, sessionWhen } from "@/features/online/components/session-views"
import { getSession, listClassAssignments } from "@/features/online/server/session-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"
import { PROVIDERS } from "@/lib/meetings"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Online session" }

const MAX_MATERIALS = 20

export default async function OnlineSessionPage({ params }: PageProps<"/online/[id]">) {
  const user = await requireRouteAccess(routes.onlineSession)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  // RLS: only the class's staff, students and their parents get a row.
  const session = await getSession(db, id)
  if (!session) notFound()

  const canWrite = can(user.permissions, "online.write")
  const student = can(user.permissions, "online.read", ["own"])
  const canTakeAttendance = can(user.permissions, "attendance.write")
  const assignments = canWrite ? await listClassAssignments(db, session.class_id) : []
  const linked = new Set(session.homework.map((h) => h.id))
  const provider = session.provider ? PROVIDERS[session.provider] : null
  const started = session.session_date <= todayInAcademy()

  return (
    <>
      <Link href={routes.online} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Online classes
      </Link>
      <PageHeader
        title={session.title}
        description={`${sessionWhen(session)} · ${session.class?.name ?? ""} · ${session.teacher?.full_name ?? ""}`}
        actions={
          canWrite ? (
            <Button variant="outline" asChild>
              <Link href={onlineEditPath(session.id)}>
                <PencilIcon aria-hidden /> Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SessionStatusBadge status={session.status} />
        {canWrite && <SessionStatusControls sessionId={session.id} status={session.status} meetingUrl={session.meeting_url} />}
        {student && (
          <JoinButton session={{ id: session.id, starts_at: session.starts_at, ends_at: session.ends_at, status: session.status, hasLink: Boolean(session.meeting_url) }} />
        )}
      </div>
      {session.status === "cancelled" && session.cancelled_reason && (
        <p className="text-destructive text-sm">Cancelled: {session.cancelled_reason}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          {session.agenda && (
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{session.agenda}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Materials</CardTitle>
              {canWrite && <CardDescription>Hidden materials are for staff only — e.g. the answer sheet.</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-3">
              {session.materials.length === 0 ? (
                <p className="text-muted-foreground text-sm">No materials yet.</p>
              ) : (
                <ul className="grid gap-1">
                  {session.materials.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        {m.kind === "file" ? <FileIcon className="size-4 shrink-0" aria-hidden /> : <LinkIcon className="size-4 shrink-0" aria-hidden />}
                        {m.href ? (
                          <a href={m.href} target="_blank" rel="noreferrer" className="truncate underline">
                            {m.title}
                          </a>
                        ) : (
                          <span className="truncate">{m.title}</span>
                        )}
                        {!m.visible_to_students && (
                          <Badge variant="outline" className="shrink-0">
                            <EyeOffIcon aria-hidden /> Staff only
                          </Badge>
                        )}
                      </span>
                      {canWrite && <MaterialActions materialId={m.id} visible={m.visible_to_students} title={m.title} />}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <div className="flex flex-wrap items-start gap-2">
                  <AddLinkMaterialDialog sessionId={session.id} />
                  <FileUploader target={{ kind: "online", sessionId: session.id }} remaining={MAX_MATERIALS - session.materials.length} label="Upload file" />
                </div>
              )}
              {canWrite && <p className="text-muted-foreground text-xs">Uploaded files start hidden; show them to students when you are ready.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Homework</CardTitle>
              {student && <CardDescription>Do it from Assignments.</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-3">
              {session.homework.length === 0 ? (
                <p className="text-muted-foreground text-sm">No homework linked.</p>
              ) : (
                <ul className="grid gap-1">
                  {session.homework.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <NotebookPenIcon className="size-4 shrink-0" aria-hidden />
                        <Link href={assignmentPath(h.id)} className="truncate underline">
                          {h.title}
                        </Link>
                        {h.due_at && <span className="text-muted-foreground shrink-0 text-xs">due {formatDateTime(h.due_at)}</span>}
                      </span>
                      {canWrite && <UnlinkHomeworkButton sessionId={session.id} assignmentId={h.id} title={h.title} />}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <LinkHomeworkDialog sessionId={session.id} assignments={assignments.filter((a) => !linked.has(a.id))} />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${routes.assignmentNew}?class=${session.class_id}`}>
                      <PlusIcon aria-hidden /> New assignment
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Teaching notes</CardTitle>
                <CardDescription>Staff only — students and parents never see these.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <TeachingNotesEditor sessionId={session.id} initial={session.notes?.notes ?? ""} />
                {session.notes?.updated_at && (
                  <p className="text-muted-foreground text-xs">
                    Last saved {formatDateTime(session.notes.updated_at)}
                    {session.notes.updated_by_name && ` by ${session.notes.updated_by_name}`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <VideoIcon className="size-4" aria-hidden /> {provider?.label ?? "Meeting"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {!session.meeting_url ? (
                <p className="text-muted-foreground">No meeting link yet.</p>
              ) : canWrite ? (
                <a href={session.meeting_url} target="_blank" rel="noreferrer" className="break-all underline">
                  {session.meeting_url}
                </a>
              ) : (
                <p className="text-muted-foreground">Use “Join lesson” to open the meeting.</p>
              )}
              {session.meeting_code && (
                <p>
                  Meeting ID: <span className="font-mono">{session.meeting_code}</span>
                </p>
              )}
              {session.passcode && (
                <p>
                  Passcode: <span className="font-mono">{session.passcode}</span>
                </p>
              )}
              {session.recording_url && (
                <a href={session.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Watch the recording <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              )}
              {session.started_at && <p className="text-muted-foreground text-xs">Started {formatDateTime(session.started_at)}</p>}
              {session.ended_at && <p className="text-muted-foreground text-xs">Ended {formatDateTime(session.ended_at)}</p>}
            </CardContent>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon className="size-4" aria-hidden /> Attendance
                </CardTitle>
                <CardDescription>Students who opened the meeting from BSmart. Mark the register to record attendance.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {session.joins.length === 0 ? (
                  <p className="text-muted-foreground">Nobody has joined through BSmart yet.</p>
                ) : (
                  <ul className="grid gap-1">
                    {session.joins.map((j) => (
                      <li key={j.student_id} className="flex justify-between gap-2">
                        <span>{j.student?.full_name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatDateTime(j.first_joined_at)}
                          {j.join_count > 1 && ` ×${j.join_count}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {canTakeAttendance &&
                  session.status !== "cancelled" &&
                  (started ? (
                    <Button variant="outline" asChild>
                      <Link href={classAttendancePath(session.class_id, session.session_date)}>
                        <ClipboardCheckIcon aria-hidden /> Mark attendance
                      </Link>
                    </Button>
                  ) : (
                    <p className="text-muted-foreground text-xs">The register opens on the day of the lesson.</p>
                  ))}
              </CardContent>
            </Card>
          )}

          {canWrite && session.created_by_name && <p className="text-muted-foreground text-xs">Scheduled by {session.created_by_name}</p>}
        </div>
      </div>
    </>
  )
}
