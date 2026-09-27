import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { routes, testPath } from "@/config/routes"
import { TestForm } from "@/features/tests/components/test-form"
import { getTest, listAttempts, listTestClasses } from "@/features/tests/server/test-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { isoToAcademyInput } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Edit test") }
}

export default async function EditTestPage({ params }: PageProps<"/tests/[id]/edit">) {
  const t = await getT()
  await requireRouteAccess(routes.testEdit)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [test, classes, attempts] = await Promise.all([getTest(db, id), listTestClasses(db), listAttempts(db, id)])
  if (!test) notFound()
  if (test.status === "archived") redirect(testPath(id))
  const options = classes.some((c) => c.id === test.class_id) || !test.class ? classes : [...classes, { id: test.class.id, name: test.class.name }]

  return (
    <>
      <PageHeader title={t("Edit test")} description={test.title} />
      <TestForm
        testId={test.id}
        classes={options}
        started={attempts.length > 0}
        classLocked={test.published_at !== null}
        cancelHref={testPath(test.id)}
        defaultValues={{
          classId: test.class_id,
          title: test.title,
          description: test.description ?? "",
          instructions: test.instructions ?? "",
          availableFrom: isoToAcademyInput(test.available_from),
          availableUntil: isoToAcademyInput(test.available_until),
          timeLimitMinutes: test.time_limit_minutes ? String(test.time_limit_minutes) : "",
          maxAttempts: String(test.max_attempts),
          shuffleQuestions: test.shuffle_questions,
          shuffleOptions: test.shuffle_options,
          totalScore: String(Number(test.total_score)),
          reviewPolicy: test.review_policy,
        }}
      />
    </>
  )
}
