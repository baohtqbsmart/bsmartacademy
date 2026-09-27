import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { StudentForm } from "@/features/students/components/student-form"
import { listEnglishLevels } from "@/features/students/server/student-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Add student") }
}

export default async function NewStudentPage() {
  const t = await getT()
  await requireRouteAccess(routes.studentNew)
  const levels = await listEnglishLevels(await createClient())

  return (
    <>
      <PageHeader
        title={t("Add student")}
        description={t("A student ID is generated automatically. Link parents and enrol in classes from the profile.")}
      />
      <StudentForm
        levels={levels}
        cancelHref={routes.students}
        defaultValues={{
          fullName: "",
          dateOfBirth: "",
          gender: "",
          phone: "",
          email: "",
          address: "",
          schoolName: "",
          joinedOn: new Date().toISOString().slice(0, 10),
          englishLevelCode: "",
          targetLevelCode: "",
          status: "active",
          notes: "",
        }}
      />
    </>
  )
}
