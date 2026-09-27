import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { onlineSessionPath, routes } from "@/config/routes"
import { SessionForm } from "@/features/online/components/session-form"
import { getSession, listOnlineClasses } from "@/features/online/server/session-service"
import { academyDate, academyTime } from "@/features/online/sessions"
import { requireRouteAccess } from "@/lib/auth/session"
import { detectProvider } from "@/lib/meetings"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit online session") }
}

export default async function EditOnlineSessionPage({ params }: PageProps<"/online/[id]/edit">) {
  const t = await getT()
  await requireRouteAccess(routes.onlineEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const [session, classes] = await Promise.all([getSession(db, id), listOnlineClasses(db)])
  if (!session) notFound()

  // The session's class is listed even if it has since finished.
  const options = classes.some((c) => c.id === session.class_id)
    ? classes
    : [...classes, { id: session.class_id, name: session.class?.name ?? "Class", meetingUrl: null, teachers: session.teacher ? [{ ...session.teacher, lead: true }] : [] }]

  return (
    <>
      <PageHeader title={t("Edit online session")} description={session.title} />
      <SessionForm
        classes={options}
        editing
        cancelHref={onlineSessionPath(session.id)}
        initial={{
          sessionId: session.id,
          classId: session.class_id,
          teacherId: session.teacher_id,
          title: session.title,
          agenda: session.agenda ?? "",
          date: academyDate(session.starts_at),
          startTime: academyTime(session.starts_at),
          endTime: academyTime(session.ends_at),
          provider: session.provider ?? detectProvider(session.meeting_url ?? "") ?? "other",
          meetingUrl: session.meeting_url ?? "",
          meetingCode: session.meeting_code ?? "",
          passcode: session.passcode ?? "",
          recordingUrl: session.recording_url ?? "",
        }}
      />
    </>
  )
}
