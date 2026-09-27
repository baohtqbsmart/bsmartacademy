import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { StudentForm } from "@/features/students/components/student-form"
import { listEnglishLevels } from "@/features/students/server/student-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Add student" }

export default async function NewStudentPage() {
  await requireRouteAccess(routes.studentNew)
  const levels = await listEnglishLevels(await createClient())

  return (
    <>
      <PageHeader
        title="Add student"
        description="A student ID is generated automatically. Link parents and enrol in classes from the profile."
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
