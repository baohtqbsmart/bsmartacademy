import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { questionPath, routes } from "@/config/routes"
import { QuestionForm } from "@/features/question-bank/components/question-form"
import { toFormValues } from "@/features/question-bank/form-values"
import { getBankQuestion, listSubjects } from "@/features/question-bank/server/bank-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit question" }

export default async function EditQuestionPage({ params }: PageProps<"/question-bank/[id]/edit">) {
  const user = await requireRouteAccess(routes.questionEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [question, subjects] = await Promise.all([getBankQuestion(db, id), listSubjects(db)])
  if (!question) notFound()
  // Teachers edit their own questions (the database enforces it); others duplicate first.
  const mayEdit = can(user.permissions, "question_bank.write", ["all"]) || question.created_by === user.id
  if (!mayEdit || question.status === "archived") redirect(questionPath(id))

  return (
    <>
      <PageHeader
        title="Edit question"
        description={question.usedIn.length > 0 ? "Tests that already use it keep their own copy; this edit applies to future tests." : undefined}
      />
      <QuestionForm initial={toFormValues(question)} subjects={subjects} cancelHref={questionPath(id)} />
    </>
  )
}
