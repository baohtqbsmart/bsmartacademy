import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { GenerateForm } from "@/features/ai/components/generate-form"
import { aiStatus } from "@/lib/ai"
import { requireRouteAccess } from "@/lib/auth/session"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New AI draft") }
}

// The generate action runs from this page: one AI call, retries and one
// corrective attempt can exceed the platform's default function limit.
export const maxDuration = 300

export default async function NewAiDraftPage() {
  const t = await getT()
  await requireRouteAccess(routes.aiNew)
  const status = aiStatus()
  return (
    <>
      <PageHeader title={t("New AI draft")} description={t("Tell the assistant about your class and the lesson. You will review and edit everything before it is used.")} />
      {!status.configured && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t("{reason} Generating is unavailable until an administrator configures it.", { reason: status.reason })}
        </p>
      )}
      <GenerateForm disabled={!status.configured} />
    </>
  )
}
