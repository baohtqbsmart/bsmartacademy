import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { NewDesignForm } from "@/features/designer/components/new-design-form"
import { listTemplates } from "@/features/designer/server/design-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("New design") }
}

export default async function NewDesignPage({ searchParams }: PageProps<"/designs/new">) {
  const t = await getT()
  await requireRouteAccess(routes.designNew)
  const templates = await listTemplates(await createClient())
  const requested = firstParam(await searchParams, "template") ?? null

  return (
    <>
      <PageHeader title={t("New design")} description={t("Start blank or from a template for vocabulary, grammar, the four skills, IELTS, Cambridge or review.")} />
      <NewDesignForm templates={templates} initialTemplate={requested} />
    </>
  )
}
