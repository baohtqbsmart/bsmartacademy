import { VideoOffIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { SessionForm } from "@/features/online/components/session-form"
import { listOnlineClasses } from "@/features/online/server/session-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New online session") }
}

export default async function NewOnlineSessionPage({ searchParams }: PageProps<"/online/new">) {
  const tr = await getT()
  await requireRouteAccess(routes.onlineNew)
  // Teachers only see the classes they teach.
  const classes = await listOnlineClasses(await createClient())
  const requested = uuidParam(await searchParams, "class")
  const klass = classes.find((c) => c.id === requested) ?? (classes.length === 1 ? classes[0] : undefined)
  const teacher = klass?.teachers.find((t) => t.lead) ?? klass?.teachers[0]

  return (
    <>
      <PageHeader title={tr("New online session")} description={tr("Schedule a lesson and attach its meeting link. Materials and homework are added on the next page.")} />
      {classes.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={VideoOffIcon} title={tr("No planned or active classes")} description={tr("Online sessions can only be scheduled for classes you teach that are planned or running.")} />
          </CardContent>
        </Card>
      ) : (
        <SessionForm
          classes={classes}
          editing={false}
          cancelHref={routes.online}
          initial={{
            classId: klass?.id ?? "",
            teacherId: teacher?.id ?? "",
            title: "",
            agenda: "",
            date: todayInAcademy(),
            startTime: "18:00",
            endTime: "19:30",
            provider: "google_meet",
            meetingUrl: klass?.meetingUrl ?? "",
            meetingCode: "",
            passcode: "",
            recordingUrl: "",
          }}
        />
      )}
    </>
  )
}
