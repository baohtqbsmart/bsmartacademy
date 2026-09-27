import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { TaskForm } from "@/features/assessments/components/task-form"
import { listAssessmentClasses, listRubrics } from "@/features/assessments/server/assessment-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New writing or speaking task") }
}

export default async function NewTaskPage({ searchParams }: PageProps<"/assessments/new">) {
  const t = await getT()
  await requireRouteAccess(routes.assessmentNew)
  const kind = enumParam(await searchParams, "kind", ["writing", "speaking"] as const) ?? "writing"
  const db = await createClient()
  const [classes, rubrics] = await Promise.all([listAssessmentClasses(db), listRubrics(db)])
  const template = rubrics.find((r) => r.kind === kind && r.is_system)

  return (
    <>
      <PageHeader
        title={t("New {kind} task", { kind })}
        description={kind === "writing" ? t("Or create a speaking task instead.") : t("Or create a writing task instead.")}
        actions={
          <a href={`${routes.assessmentNew}?kind=${kind === "writing" ? "speaking" : "writing"}`} className="text-sm underline">
            {t("Switch to {value}", { value: kind === "writing" ? "speaking" : "writing" })}
          </a>
        }
      />
      <TaskForm
        classes={classes}
        rubrics={rubrics}
        locked={false}
        cancelHref={routes.assessments}
        initial={{
          classId: classes.length === 1 ? classes[0].id : "",
          kind,
          title: "",
          cefrLevel: "",
          task: "",
          instructions: "",
          responseMode: kind === "writing" ? "online_or_document" : "audio_or_video",
          minWords: "",
          maxWords: "",
          maxDurationSeconds: "",
          rubricId: template?.id ?? "",
          scoring: template?.scoring ?? "points",
          criteria: (template?.criteriaList ?? [{ name: "", max_points: 5 }]).map((c) => ({ name: c.name, description: c.description ?? "", maxPoints: String(c.max_points) })),
          maxAttempts: "1",
          dueAt: "",
          allowLate: true,
        }}
      />
    </>
  )
}
