import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, routes } from "@/config/routes"
import { FileList } from "@/features/assignments/components/file-list"
import { WorkForm } from "@/features/assignments/components/work-form"
import { getAssignment } from "@/features/assignments/server/assignment-service"
import { listAttempts } from "@/features/assignments/server/submission-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Work on assignment" }

export default async function AssignmentWorkPage({ params }: PageProps<"/assignments/[id]/work">) {
  await requireRouteAccess(routes.assignmentWork)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const assignment = await getAssignment(db, id)
  if (!assignment) notFound()

  // RLS: only the student's own attempts. Work happens only on an open attempt;
  // otherwise the assignment page explains why (submitted, closed...).
  const attempts = await listAttempts(db, assignment.id)
  const open = attempts.find((a) => a.status === "in_progress")
  if (!open) redirect(assignmentPath(assignment.id))

  return (
    <>
      <Link href={assignmentPath(assignment.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {assignment.title}
      </Link>
      <PageHeader
        title={assignment.title}
        description={`${assignment.class?.name ?? ""}${assignment.due_at ? ` · due ${formatDateTime(assignment.due_at)}` : ""}`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm whitespace-pre-wrap">{assignment.instructions || assignment.description || "—"}</p>
          {assignment.attachments.length > 0 && <FileList files={assignment.attachments} />}
        </CardContent>
      </Card>
      <WorkForm
        assignmentId={assignment.id}
        submission={{
          id: open.id,
          attempt: open.attempt,
          answers: open.answers,
          response_text: open.response_text,
          deadline_at: open.deadline_at,
        }}
        questions={assignment.questions}
        files={open.files}
        requiresFile={assignment.requires_file}
      />
    </>
  )
}
