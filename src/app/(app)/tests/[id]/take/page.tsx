import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes, testPath } from "@/config/routes"
import { TakeTest } from "@/features/tests/components/take-test"
import { getAttempt, getResponses } from "@/features/tests/server/attempt-service"
import { getTest, listAttempts, listTestQuestions } from "@/features/tests/server/test-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Take test" }

export default async function TakeTestPage({ params }: PageProps<"/tests/[id]/take">) {
  await requireRouteAccess(routes.testTake)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const test = await getTest(db, id)
  if (!test) notFound()

  // RLS: only the student's own attempts. Without an open one, the test page
  // explains what is possible (start, used up, closed...).
  const open = (await listAttempts(db, test.id)).find((a) => a.status === "in_progress")
  if (!open) redirect(testPath(test.id))

  const [attempt, questions, responses] = await Promise.all([getAttempt(db, open.id), listTestQuestions(db, test.id), getResponses(db, open.id)])
  if (!attempt) redirect(testPath(test.id))
  const byId = new Map(questions.map((q) => [q.id, q]))
  // The attempt's own (possibly shuffled) order.
  const ordered = attempt.question_order.flatMap((qid) => {
    const q = byId.get(qid)
    return q ? [{ id: q.id, question_type: q.question_type, prompt: q.prompt, content: q.content, points: Number(q.points), mediaUrl: q.mediaUrl }] : []
  })

  return (
    <>
      <PageHeader title={test.title} description={test.instructions ?? undefined} />
      <TakeTest
        testId={test.id}
        attemptId={attempt.id}
        attemptNumber={attempt.attempt_number}
        deadline={attempt.deadline_at}
        optionOrders={attempt.option_orders}
        questions={ordered}
        initialResponses={responses}
      />
    </>
  )
}
