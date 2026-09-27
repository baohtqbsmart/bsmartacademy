import { ArrowLeftIcon, BotIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, designPath, routes } from "@/config/routes"
import { PlanEditor } from "@/features/ai/components/plan-editor"
import { PlanView } from "@/features/ai/components/plan-view"
import { SaveToPlatform } from "@/features/ai/components/save-to-platform"
import { CEFR_NAMES, planProblems, SKILL_NAMES, TASK_LABELS } from "@/features/ai/content"
import { getDraft, listTeachableClasses } from "@/features/ai/server/ai-service"
import { PrintButton } from "@/features/reports/components/report-chart"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "AI draft" }

export default async function AiDraftPage({ params }: PageProps<"/ai/[id]">) {
  const user = await requireRouteAccess(routes.aiDraft)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  // RLS: the teacher's own drafts (administrators may read, not edit).
  const draft = await getDraft(db, id)
  if (!draft) notFound()
  const own = draft.owner_id === user.id
  const classes = draft.status === "approved" && own ? await listTeachableClasses(db) : []
  const input = draft.input

  return (
    <>
      <Link href={routes.ai} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm print:hidden">
        <ArrowLeftIcon className="size-4" aria-hidden /> AI assistant
      </Link>
      <PageHeader
        title={draft.title}
        description={`${TASK_LABELS[draft.task]} · ${input.topic} · ${CEFR_NAMES[input.cefr]} · age ${input.studentAge} · ${SKILL_NAMES[input.skill]} · ${input.durationMinutes} min`}
        actions={
          <div className="print:hidden">
            <PrintButton />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="gap-1">
          <BotIcon aria-hidden /> AI-generated draft
        </Badge>
        {draft.status === "draft" && <Badge variant="outline">Needs your review</Badge>}
        {draft.status === "approved" && <Badge>Approved by {draft.approved_by_name || "the teacher"} · {draft.approved_at && formatDateTime(draft.approved_at)}</Badge>}
        {draft.status === "discarded" && <Badge variant="secondary">Discarded</Badge>}
        <span className="text-muted-foreground text-xs">
          Written by {draft.model} on {formatDateTime(draft.created_at)}. Check facts, answer keys and suitability for your students before use.
        </span>
      </div>
      <p className="text-muted-foreground text-xs">Objective: {input.objective}</p>

      {draft.status === "approved" && own && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Save to the platform</CardTitle>
            <CardDescription>Nothing is published: a design is private to you, and an assignment is created as a draft.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <SaveToPlatform draftId={draft.id} classes={classes} canDesign={can(user.permissions, "designs.write")} canAssign={can(user.permissions, "assignments.write")} />
            {draft.savedTo.length > 0 && (
              <ul className="text-sm">
                {draft.savedTo.map((s) => (
                  <li key={s.id}>
                    Saved as{" "}
                    <Link className="underline" href={s.type === "design" ? designPath(s.id) : assignmentPath(s.id)}>
                      {s.type === "design" ? "a lesson design" : "a draft assignment"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {!draft.plan ? (
        <p className="text-destructive text-sm">This draft&apos;s content could not be read.</p>
      ) : draft.status === "draft" && own ? (
        <PlanEditor draftId={draft.id} initial={draft.plan} warnings={planProblems(draft.task, draft.plan, input.durationMinutes)} />
      ) : (
        <Card>
          <CardContent>
            <PlanView plan={draft.plan} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
