import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { assignmentPath, routes } from "@/config/routes"
import { AssignmentForm } from "@/features/assignments/components/assignment-form"
import { getAssignment, listAssignableClasses } from "@/features/assignments/server/assignment-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { isoToAcademyInput } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit assignment" }

export default async function EditAssignmentPage({ params }: PageProps<"/assignments/[id]/edit">) {
  await requireRouteAccess(routes.assignmentEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [assignment, classes] = await Promise.all([getAssignment(db, id), listAssignableClasses(db)])
  // RLS: a teacher only sees (and so only edits) their own classes' assignments.
  if (!assignment) notFound()
  // Archived work is read-only until restored (the database refuses edits).
  if (assignment.state === "archived") redirect(assignmentPath(assignment.id))
  const options = classes.map((c) => ({ id: c.id, name: c.name, course: c.course?.name ?? null, level: c.course?.level?.name ?? null }))
  if (!options.some((c) => c.id === assignment.class_id) && assignment.class) {
    options.push({
      id: assignment.class.id,
      name: assignment.class.name,
      course: assignment.class.course?.name ?? null,
      level: assignment.class.course?.level?.name ?? null,
    })
  }

  return (
    <>
      <PageHeader title="Edit assignment" description={assignment.title} />
      <AssignmentForm
        assignmentId={assignment.id}
        classes={options}
        classLocked={assignment.published_at !== null}
        cancelHref={assignmentPath(assignment.id)}
        defaultValues={{
          classId: assignment.class_id,
          title: assignment.title,
          assignmentType: assignment.assignment_type,
          skill: assignment.skill ?? "",
          description: assignment.description ?? "",
          instructions: assignment.instructions ?? "",
          dueAt: isoToAcademyInput(assignment.due_at),
          timeLimitMinutes: assignment.time_limit_minutes ? String(assignment.time_limit_minutes) : "",
          maxScore: String(Number(assignment.max_score)),
          allowLate: assignment.allow_late,
          requiresFile: assignment.requires_file,
        }}
      />
    </>
  )
}
