import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { archiveRubricAction } from "@/features/assessments/actions"
import { RubricDialog } from "@/features/assessments/components/rubric-editor"
import { listRubrics } from "@/features/assessments/server/assessment-service"
import { KIND_LABELS, maxScore, SCORING_LABELS } from "@/features/assessments/scoring"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Rubrics" }

export default async function RubricsPage() {
  const user = await requireRouteAccess(routes.assessmentRubrics)
  const rubrics = await listRubrics(await createClient())
  const admin = can(user.permissions, "assessments.write", ["all"])

  return (
    <>
      <PageHeader title="Rubrics" description="Templates for writing and speaking tasks. Tasks copy a rubric when they are set." actions={<RubricDialog />} />
      <div className="grid gap-4 md:grid-cols-2">
        {rubrics.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {r.name}
                <Badge variant="outline">{KIND_LABELS[r.kind]}</Badge>
                {r.is_system && <Badge variant="secondary">Built-in</Badge>}
              </CardTitle>
              <CardDescription>
                {SCORING_LABELS[r.scoring]} · maximum {maxScore(r.scoring, r.criteriaList)}
                {r.description && ` · ${r.description}`}
              </CardDescription>
              {!r.is_system && (admin || r.created_by === user.id) && (
                <CardAction className="flex gap-1">
                  <RubricDialog
                    initial={{
                      rubricId: r.id,
                      name: r.name,
                      kind: r.kind,
                      scoring: r.scoring,
                      description: r.description ?? "",
                      criteria: r.criteriaList.map((c) => ({ name: c.name, description: c.description ?? "", maxPoints: String(c.max_points) })),
                    }}
                  />
                  <ConfirmActionButton variant="ghost" size="sm" title="Archive this rubric?" description="Tasks that use it keep their copy." confirmLabel="Archive" successMessage="Rubric archived." action={archiveRubricAction.bind(null, { rubricId: r.id })}>
                    Archive
                  </ConfirmActionButton>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm">
                {r.criteriaList.map((c) => (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span>
                      <span className="font-medium">{c.name}</span>
                      {c.description && <span className="text-muted-foreground"> · {c.description}</span>}
                    </span>
                    <span className="tabular-nums">{c.max_points}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
