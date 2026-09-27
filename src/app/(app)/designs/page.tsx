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

export const metadata: Metadata = { title: "Lesson designer" }

export default async function DesignsPage({ searchParams }: PageProps<"/designs">) {
  const user = await requireRouteAccess(routes.designs)
  const params = await searchParams
  const kind = enumParam(params, "kind", DESIGN_KINDS)
  const q = firstParam(params, "q")?.trim().slice(0, 100) || undefined
  const canWrite = can(user.permissions, "designs.write")
  const { designs, assets } = await listDesigns(await createClient(), { kind, q })

  return (
    <>
      <PageHeader
        title="Lesson designer"
        description="Slides, worksheets, flashcards, vocabulary cards, grammar activities, quizzes and exit tickets."
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.designNew}>
                <PlusIcon aria-hidden /> New design
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.designs}
        values={{ kind, q }}
        searchPlaceholder="Search titles"
        filters={[{ param: "kind", allLabel: "All types", options: DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })) }]}
      />
      {designs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={PaletteIcon}
              title={kind || q ? "No designs match" : "No designs yet"}
              description={kind || q ? undefined : "Create one from a template or start blank."}
              action={
                canWrite && !kind && !q ? (
                  <Button asChild>
                    <Link href={routes.designNew}>
                      <PlusIcon aria-hidden /> New design
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
                <Link href={designPath(d.id)} className="bg-muted flex aspect-video items-center justify-center overflow-hidden border-b" aria-label={`Open ${d.title}`}>
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
                    <Badge variant="secondary">{KIND_LABELS[d.kind]}</Badge>
                    {d.share_token && (
                      <Badge variant="outline">
                        <Link2Icon aria-hidden /> Shared
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {d.owner_id !== user.id && `${d.owner_name} · `}Edited {formatDateTime(d.updated_at)}
                  </p>
                  <div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={designPreviewPath(d.id)}>
                        <PlayIcon aria-hidden /> Present
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
