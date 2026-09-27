import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { QuestionForm } from "@/features/question-bank/components/question-form"
import { emptyQuestion } from "@/features/question-bank/form-values"
import { listSubjects } from "@/features/question-bank/server/bank-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "New question" }

export default async function NewQuestionPage() {
  await requireRouteAccess(routes.questionNew)
  const subjects = await listSubjects(await createClient())
  return (
    <>
      <PageHeader title="New question" description="Saved to the shared bank; add audio or a picture on its page afterwards." />
      <QuestionForm initial={emptyQuestion(subjects.length === 1 ? subjects[0].id : "")} subjects={subjects} cancelHref={routes.questionBank} />
    </>
  )
}
