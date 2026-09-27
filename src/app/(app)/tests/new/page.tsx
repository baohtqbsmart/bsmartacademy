import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { TestForm } from "@/features/tests/components/test-form"
import { listTestClasses } from "@/features/tests/server/test-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "New test" }

export default async function NewTestPage({ searchParams }: PageProps<"/tests/new">) {
  await requireRouteAccess(routes.testNew)
  const classes = await listTestClasses(await createClient())
  const requested = uuidParam(await searchParams, "class")
  return (
    <>
      <PageHeader title="New test" description="Saved as a draft. Add questions from the bank, then publish." />
      <TestForm
        classes={classes}
        cancelHref={routes.tests}
        defaultValues={{
          classId: classes.some((c) => c.id === requested) ? requested! : classes.length === 1 ? classes[0].id : "",
          title: "",
          description: "",
          instructions: "",
          availableFrom: "",
          availableUntil: "",
          timeLimitMinutes: "",
          maxAttempts: "1",
          shuffleQuestions: true,
          shuffleOptions: true,
          totalScore: "10",
          reviewPolicy: "after_last_attempt",
        }}
      />
    </>
  )
}
