import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { ClassForm } from "@/features/classes/components/class-form"
import { listActiveCourseOptions } from "@/features/courses/server/course-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "New class" }

export default async function NewClassPage() {
  await requireRouteAccess(routes.classNew)
  const courses = await listActiveCourseOptions(await createClient())

  return (
    <>
      <PageHeader title="New class" description="Then assign teachers, add time slots and enrol students." />
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
