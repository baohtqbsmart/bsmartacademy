import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { CourseForm } from "@/features/courses/components/course-form"
import { listSubjectOptions } from "@/features/subjects/server/subject-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New course") }
}

export default async function NewCoursePage() {
  const t = await getT()
  await requireRouteAccess(routes.courseNew)
  const subjects = await listSubjectOptions(await createClient())

  return (
    <>
      <PageHeader title={t("New course")} description={t("Start as a draft, add its units, then activate it.")} />
      <CourseForm
        subjects={subjects}
        cancelHref={routes.courses}
        defaultValues={{
          code: "",
          name: "",
          description: "",
          subjectId: "",
          levelId: "",
          sessionCount: "",
          sessionMinutes: "90",
          durationWeeks: "",
          status: "draft",
        }}
      />
    </>
  )
}
