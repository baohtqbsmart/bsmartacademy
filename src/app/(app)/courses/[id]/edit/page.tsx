import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { coursePath, routes } from "@/config/routes"
import { CourseForm } from "@/features/courses/components/course-form"
import { getCourse } from "@/features/courses/server/course-service"
import { listSubjectOptions } from "@/features/subjects/server/subject-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit course" }

const text = (value: number | null) => (value === null ? "" : String(value))

export default async function EditCoursePage({ params }: PageProps<"/courses/[id]/edit">) {
  await requireRouteAccess(routes.courseEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const [course, subjects] = await Promise.all([getCourse(db, id), listSubjectOptions(db)])
  if (!course) notFound()

  return (
    <>
      <PageHeader title={`Edit ${course.name}`} description={course.code} />
      <CourseForm
        courseId={course.id}
        subjects={subjects}
        cancelHref={coursePath(course.id)}
        defaultValues={{
          code: course.code,
          name: course.name,
          description: course.description,
          subjectId: course.subject_id,
          levelId: course.level_id ?? "",
          sessionCount: text(course.session_count),
          sessionMinutes: text(course.session_minutes),
          durationWeeks: text(course.duration_weeks),
          status: course.status,
        }}
      />
    </>
  )
}
