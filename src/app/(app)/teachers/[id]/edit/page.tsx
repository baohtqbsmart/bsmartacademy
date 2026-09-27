import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes, teacherPath } from "@/config/routes"
import { TeacherForm } from "@/features/teachers/components/teacher-form"
import { getTeacher } from "@/features/teachers/server/teacher-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit teacher" }

export default async function EditTeacherPage({ params }: PageProps<"/teachers/[id]/edit">) {
  await requireRouteAccess(routes.teacherEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const teacher = await getTeacher(await createClient(), id)
  if (!teacher) notFound()

  return (
    <>
      <PageHeader title={`Edit ${teacher.full_name}`} description={teacher.teacher_code} />
      <TeacherForm
        teacherId={teacher.id}
        cancelHref={teacherPath(teacher.id)}
        defaultValues={{
          teacherCode: teacher.teacher_code,
          fullName: teacher.full_name,
          email: teacher.email ?? "",
          phone: teacher.phone ?? "",
          hiredOn: teacher.hired_on ?? "",
          status: teacher.status,
          notes: teacher.notes ?? "",
        }}
      />
    </>
  )
}
