import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { assessmentPath, routes } from "@/config/routes"
import { TaskForm } from "@/features/assessments/components/task-form"
import { getTask, listAssessmentClasses, listRubrics, listTaskSubmissions } from "@/features/assessments/server/assessment-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { isoToAcademyInput } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit task" }

export default async function EditTaskPage({ params }: PageProps<"/assessments/[id]/edit">) {
  await requireRouteAccess(routes.assessmentEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const [task, classes, rubrics, submissions] = await Promise.all([getTask(db, id), listAssessmentClasses(db), listRubrics(db), listTaskSubmissions(db, id)])
  if (!task) notFound()
  if (task.status === "archived") redirect(assessmentPath(id))
  const options = classes.some((c) => c.id === task.class_id) || !task.class ? classes : [...classes, task.class]

  return (
    <>
      <PageHeader title="Edit task" description={task.title} />
      <TaskForm
        classes={options}
        rubrics={rubrics}
        locked={submissions.length > 0}
        cancelHref={assessmentPath(id)}
        initial={{
          taskId: task.id,
          classId: task.class_id,
          kind: task.kind,
          title: task.title,
          cefrLevel: task.cefr_level ?? "",
          task: task.task,
          instructions: task.instructions ?? "",
          responseMode: task.response_mode,
          minWords: task.min_words ? String(task.min_words) : "",
          maxWords: task.max_words ? String(task.max_words) : "",
          maxDurationSeconds: task.max_duration_seconds ? String(task.max_duration_seconds) : "",
          rubricId: task.rubric_id ?? "",
          scoring: task.scoring,
          criteria: task.criteriaList.map((c) => ({ name: c.name, description: c.description ?? "", maxPoints: String(c.max_points) })),
          maxAttempts: String(task.max_attempts),
          dueAt: isoToAcademyInput(task.due_at),
          allowLate: task.allow_late,
        }}
      />
    </>
  )
}
