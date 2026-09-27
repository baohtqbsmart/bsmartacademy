import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { AssignmentForm } from "@/features/assignments/components/assignment-form"
import { listAssignableClasses } from "@/features/assignments/server/assignment-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "New assignment" }

export default async function NewAssignmentPage({ searchParams }: PageProps<"/assignments/new">) {
  await requireRouteAccess(routes.assignmentNew)
  const classes = await listAssignableClasses(await createClient())
  const requested = uuidParam(await searchParams, "class")

  return (
    <>
      <PageHeader title="New assignment" description="Saved as a draft. Students see it only once you publish it." />
      <AssignmentForm
        classes={classes.map((c) => ({ id: c.id, name: c.name, course: c.course?.name ?? null, level: c.course?.level?.name ?? null }))}
        cancelHref={routes.assignments}
        defaultValues={{
          classId: classes.some((c) => c.id === requested) ? requested! : classes.length === 1 ? classes[0].id : "",
          title: "",
          assignmentType: "homework",
          skill: "",
          description: "",
          instructions: "",
          dueAt: "",
          timeLimitMinutes: "",
          maxScore: "10",
          allowLate: true,
          requiresFile: false,
        }}
      />
    </>
  )
}
