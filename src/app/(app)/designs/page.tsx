import { Link2Icon, PaletteIcon, PlayIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { designPath, designPreviewPath, routes } from "@/config/routes"
import { PageThumbnail } from "@/features/designer/components/page-view"
import { DESIGN_KINDS, KIND_LABELS } from "@/features/designer/model"
import { listDesigns } from "@/features/designer/server/design-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Lesson designer") }
}

export default async function DesignsPage({ searchParams }: PageProps<"/designs">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.designs)
  const params = await searchParams
  const kind = enumParam(params, "kind", DESIGN_KINDS)
  const q = firstParam(params, "q")?.trim().slice(0, 100) || undefined
  const canWrite = can(user.permissions, "designs.write")
  const { designs, assets } = await listDesigns(await createClient(), { kind, q })

  return (
    <>
      <PageHeader
        title={t("Lesson designer")}
        description={t("Slides, worksheets, flashcards, vocabulary cards, grammar activities, quizzes and exit tickets.")}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.designNew}>
                <PlusIcon aria-hidden /> {t("New design")}
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.designs}
        values={{ kind, q }}
        searchPlaceholder={t("Search titles")}
        filters={[{ param: "kind", allLabel: "All types", options: DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })) }]}
      />
      {designs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={PaletteIcon}
              title={kind || q ? t("No designs match") : t("No designs yet")}
              description={kind || q ? undefined : t("Create one from a template or start blank.")}
              action={
                canWrite && !kind && !q ? (
                  <Button asChild>
                    <Link href={routes.designNew}>
                      <PlusIcon aria-hidden /> {t("New design")}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {designs.map((d) => (
            <li key={d.id}>
              <Card className="h-full gap-0 overflow-hidden py-0">
                <Link href={designPath(d.id)} className="bg-muted flex aspect-video items-center justify-center overflow-hidden border-b" aria-label={t("Open {title}", { title: d.title })}>
                  {d.firstPage ? (
                    <div className="shadow-sm">
                      <PageThumbnail page={d.firstPage} pageSize={d.pageSize} assets={assets} width={d.pageSize === "a4_portrait" ? 100 : 216} />
                    </div>
                  ) : null}
                </Link>
                <CardContent className="grid gap-2 p-3">
                  <Link href={designPath(d.id)} className="line-clamp-2 font-medium hover:underline">
                    {d.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{t(KIND_LABELS[d.kind])}</Badge>
                    {d.share_token && (
                      <Badge variant="outline">
                        <Link2Icon aria-hidden /> {t("Shared")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {d.owner_id !== user.id && `${d.owner_name} · `}{t("Edited {dateTime}", { dateTime: formatDateTime(d.updated_at) })}
                  </p>
                  <div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={designPreviewPath(d.id)}>
                        <PlayIcon aria-hidden /> {t("Present")}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
