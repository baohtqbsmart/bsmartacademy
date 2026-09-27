import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { TeacherForm } from "@/features/teachers/components/teacher-form"
import { requireRouteAccess } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Add teacher" }

export default async function NewTeacherPage() {
  await requireRouteAccess(routes.teacherNew)

  return (
    <>
      <PageHeader
        title="Add teacher"
        description="Creates the staff record. Invite the teacher from Users & roles to give them a login."
      />
      <TeacherForm
        cancelHref={routes.teachers}
        defaultValues={{ teacherCode: "", fullName: "", email: "", phone: "", hiredOn: "", status: "active", notes: "" }}
      />
    </>
  )
}
