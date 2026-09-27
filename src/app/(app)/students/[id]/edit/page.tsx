import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes, studentPath } from "@/config/routes"
import { StudentForm } from "@/features/students/components/student-form"
import { getStudentProfile, listEnglishLevels } from "@/features/students/server/student-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit student" }

export default async function EditStudentPage({ params }: PageProps<"/students/[id]/edit">) {
  await requireRouteAccess(routes.studentEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [student, levels] = await Promise.all([getStudentProfile(db, id), listEnglishLevels(db)])
  if (!student) notFound()

  return (
    <>
      <PageHeader title={`Edit ${student.full_name}`} description={`Student ID ${student.student_code}`} />
      <StudentForm
        studentId={student.id}
        levels={levels}
        cancelHref={studentPath(student.id)}
        defaultValues={{
          fullName: student.full_name,
          dateOfBirth: student.date_of_birth ?? "",
          gender: student.gender ?? "",
          phone: student.phone ?? "",
          email: student.email ?? "",
          address: student.address ?? "",
          schoolName: student.school_name ?? "",
          joinedOn: student.joined_on ?? "",
          englishLevelCode: student.english_level_code ?? "",
          targetLevelCode: student.target_level_code ?? "",
          status: student.status,
          notes: student.notes ?? "",
        }}
      />
    </>
  )
}
