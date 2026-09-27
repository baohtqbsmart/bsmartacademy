import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { ClassForm } from "@/features/classes/components/class-form"
import { listActiveCourseOptions } from "@/features/courses/server/course-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New class") }
}

export default async function NewClassPage() {
  const t = await getT()
  await requireRouteAccess(routes.classNew)
  const courses = await listActiveCourseOptions(await createClient())

  return (
    <>
      <PageHeader title={t("New class")} description={t("Then assign teachers, add time slots and enrol students.")} />
      <ClassForm
        courses={courses}
        cancelHref={routes.classes}
        defaultValues={{
          code: "",
          name: "",
          courseId: "",
          status: "planned",
          startDate: "",
          endDate: "",
          capacity: "",
          deliveryMode: "in_person",
          room: "",
          meetingUrl: "",
        }}
      />
    </>
  )
}
