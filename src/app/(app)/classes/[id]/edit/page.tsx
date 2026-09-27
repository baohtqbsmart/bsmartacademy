import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { classPath, routes } from "@/config/routes"
import { ClassForm } from "@/features/classes/components/class-form"
import { getClass } from "@/features/classes/server/class-service"
import { listActiveCourseOptions } from "@/features/courses/server/course-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit class") }
}

export default async function EditClassPage({ params }: PageProps<"/classes/[id]/edit">) {
  const t = await getT()
  await requireRouteAccess(routes.classEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const [klass, courses] = await Promise.all([getClass(db, id), listActiveCourseOptions(db)])
  if (!klass) notFound()

  // Keep the current course selectable even if it is no longer active.
  const courseOptions =
    klass.course && !courses.some((c) => c.id === klass.course!.id)
      ? [{ id: klass.course.id, code: klass.course.code, name: klass.course.name }, ...courses]
      : courses

  return (
    <>
      <PageHeader title={t("Edit {name}", { name: klass.name })} description={klass.code} />
      <ClassForm
        classId={klass.id}
        courses={courseOptions}
        cancelHref={classPath(klass.id)}
        defaultValues={{
          code: klass.code,
          name: klass.name,
          courseId: klass.course_id,
          status: klass.status,
          startDate: klass.start_date ?? "",
          endDate: klass.end_date ?? "",
          capacity: klass.capacity ? String(klass.capacity) : "",
          deliveryMode: klass.delivery_mode,
          room: klass.room ?? "",
          meetingUrl: klass.meeting_url ?? "",
        }}
      />
    </>
  )
}
