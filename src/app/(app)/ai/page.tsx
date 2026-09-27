import { SparklesIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { aiDraftPath, routes } from "@/config/routes"
import { TASK_LABELS } from "@/features/ai/content"
import { listDrafts } from "@/features/ai/server/ai-service"
import { aiStatus } from "@/lib/ai"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("AI assistant") }
}

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "default" }> = {
  draft: { label: "Draft – needs review", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  discarded: { label: "Discarded", variant: "secondary" },
}

export default async function AiPage() {
  const t = await getT()
  const user = await requireRouteAccess(routes.ai)
  const status = aiStatus()
  const drafts = await listDrafts(await createClient())

  return (
    <>
      <PageHeader
        title={t("AI teaching assistant")}
        description={t("Drafts lessons, worksheets, exercises and prompts for you to review, edit and approve. Nothing reaches students unless you publish it yourself.")}
        actions={
          <Button asChild>
            <Link href={routes.aiNew}>
              <SparklesIcon aria-hidden /> {t("New draft")}
            </Link>
          </Button>
        }
      />
      {!status.configured && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t("{reason} An administrator sets AI_API_KEY (and optionally AI_MODEL) in the server environment. Existing drafts can still be reviewed.", { reason: status.reason })}
        </p>
      )}
      {drafts.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={SparklesIcon} title={t("No drafts yet")} description={t("Describe the lesson you need and the assistant writes a first draft.")} />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={aiDraftPath(d.id)} className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="grid gap-0.5">
                  <span className="font-medium">{d.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {t(TASK_LABELS[d.task])} · {formatDateTime(d.created_at)}
                    {d.owner_id !== user.id && ` · ${d.owner_name}`}
                  </span>
                </span>
                <Badge variant={STATUS[d.status].variant}>{t(STATUS[d.status].label)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">{t("Each teacher can make 20 AI requests an hour and 100 a day. Requests are sent to an external AI provider; do not include students' personal information.")}</p>
    </>
  )
}
