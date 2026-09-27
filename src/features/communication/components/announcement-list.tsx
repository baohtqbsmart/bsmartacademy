import { PinIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArchiveAnnouncementButton } from "@/features/communication/components/announcement-controls"
import { AUDIENCE_LABELS } from "@/features/communication/schemas"
import type { AnnouncementItem } from "@/features/communication/server/communication-service"
import { formatDateTime } from "@/lib/format"
import { getT } from "@/i18n/server"

export async function AnnouncementList({ items, canArchive, compact = false }: { items: AnnouncementItem[]; canArchive?: (a: AnnouncementItem) => boolean; compact?: boolean }) {
  const t = await getT()
  return (
    <ul className="grid gap-3">
      {items.map((a) => (
        <li key={a.id}>
          <Card className={compact ? "gap-2 py-4" : undefined}>
            <CardHeader className={compact ? "px-4" : undefined}>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {a.pinned && <PinIcon className="size-4" aria-label={t("Pinned")} />}
                {a.title}
                <Badge variant="outline" className="font-normal">
                  {a.audience === "class" ? a.class?.name ?? t("Class") : AUDIENCE_LABELS[a.audience]}
                </Badge>
                {a.archived_at && <Badge variant="secondary">{t("Archived")}</Badge>}
                {a.expired && !a.archived_at && <Badge variant="secondary">{t("Expired")}</Badge>}
              </CardTitle>
              <span className="text-muted-foreground text-xs">
                {a.author_name || t("BSmart")} · {formatDateTime(a.created_at)}
                {a.expires_at && t(" · shown until {dateTime}", { dateTime: formatDateTime(a.expires_at) })}
              </span>
            </CardHeader>
            <CardContent className={compact ? "grid gap-2 px-4" : "grid gap-3"}>
              <p className={compact ? "line-clamp-3 text-sm whitespace-pre-wrap" : "text-sm whitespace-pre-wrap"}>{a.body}</p>
              {canArchive?.(a) && !a.archived_at && (
                <div>
                  <ArchiveAnnouncementButton announcementId={a.id} />
                </div>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
