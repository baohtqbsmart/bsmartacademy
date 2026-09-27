import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { TeacherForm } from "@/features/teachers/components/teacher-form"
import { requireRouteAccess } from "@/lib/auth/session"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Add teacher") }
}

export default async function NewTeacherPage() {
  const t = await getT()
  await requireRouteAccess(routes.teacherNew)

  return (
    <>
      <PageHeader
        title={t("Add teacher")}
        description={t("Creates the staff record. Invite the teacher from Users & roles to give them a login.")}
      />
      <TeacherForm
        cancelHref={routes.teachers}
        defaultValues={{ teacherCode: "", fullName: "", email: "", phone: "", hiredOn: "", status: "active", notes: "" }}
      />
    </>
  )
}
