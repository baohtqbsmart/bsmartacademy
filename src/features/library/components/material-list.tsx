import { FileAudioIcon, FileIcon, FileImageIcon, FileTextIcon, FileVideoIcon, PresentationIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { libraryMaterialPath } from "@/config/routes"
import { SKILL_LABELS } from "@/features/assignments/status"
import { FILE_KIND_LABELS, type FileKind } from "@/features/library/catalog"
import { FavoriteButton } from "@/features/library/components/material-controls"
import type { MaterialListItem } from "@/features/library/server/library-service"
import { formatDate } from "@/lib/format"
import { formatFileSize } from "@/lib/uploads"

export const KIND_ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileTextIcon,
  document: FileIcon,
  presentation: PresentationIcon,
  image: FileImageIcon,
  audio: FileAudioIcon,
  video: FileVideoIcon,
}

export function MaterialList({ materials, userId }: { materials: MaterialListItem[]; userId: string }) {
  return (
    <ul className="grid gap-2">
      {materials.map((m) => {
        const kind = m.file_kind as FileKind
        const Icon = KIND_ICONS[kind] ?? FileIcon
        const meta = [m.subject?.name, m.level?.name, m.skill ? SKILL_LABELS[m.skill] : null, m.topic].filter(Boolean).join(" · ")
        return (
          <li key={m.id}>
            <Card className="gap-0 py-3">
              <CardContent className="flex items-start gap-3 px-4">
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <Link href={libraryMaterialPath(m.id)} className="truncate font-medium hover:underline">
                    {m.title}
                  </Link>
                  {meta && <span className="text-muted-foreground truncate text-sm">{meta}</span>}
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline">
                      {FILE_KIND_LABELS[kind] ?? kind} · {formatFileSize(m.size_bytes)}
                    </Badge>
                    {m.scope === "academy" && <Badge variant="secondary">Academy</Badge>}
                    {m.visibility === "staff" && m.owner_id === userId && <Badge variant="outline">All teachers</Badge>}
                    {m.archived_at && <Badge variant="outline">Archived</Badge>}
                    {m.tags.slice(0, 5).map((t) => (
                      <Badge key={t} variant="outline" className="text-muted-foreground font-normal">
                        #{t}
                      </Badge>
                    ))}
                    <span className="text-muted-foreground">
                      {m.owner_id === userId ? "You" : m.owner_name} · {formatDate(m.created_at.slice(0, 10))}
                    </span>
                  </span>
                </div>
                <FavoriteButton materialId={m.id} favorite={m.favorite} compact />
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
