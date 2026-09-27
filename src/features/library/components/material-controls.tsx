"use client"

import { ArchiveIcon, ArchiveRestoreIcon, DownloadIcon, FolderInputIcon, Loader2Icon, StarIcon, Trash2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { archiveMaterialAction, deleteMaterialAction, downloadAction, favoriteAction, moveMaterialAction } from "@/features/library/actions"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

export function FavoriteButton({ materialId, favorite, compact = false }: { materialId: string; favorite: boolean; compact?: boolean }) {
  const t = useT()
  const [on, setOn] = useState(favorite)
  const [isPending, startTransition] = useTransition()
  const toggle = () =>
    startTransition(async () => {
      const next = !on
      setOn(next)
      const result = await favoriteAction({ materialId, favorite: next })
      if (!result.ok) {
        setOn(!next)
        toast.error(result.error.message)
      }
    })
  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon" : "sm"}
      onClick={toggle}
      disabled={isPending}
      aria-pressed={on}
      aria-label={on ? t("Remove from favourites") : t("Add to favourites")}
      title={on ? t("Remove from favourites") : t("Add to favourites")}
    >
      <StarIcon className={cn(on && "fill-amber-400 text-amber-500")} aria-hidden />
      {!compact && (on ? t("Favourite") : t("Add to favourites"))}
    </Button>
  )
}

/** Asks for a fresh five-minute link, then downloads. */
export function DownloadButton({ materialId, variant = "default" }: { materialId: string; variant?: "default" | "outline" | "ghost" }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await downloadAction({ materialId })
          if (!result.ok) return void toast.error(result.error.message)
          window.location.href = result.data
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <DownloadIcon aria-hidden />} {t("Download")}
    </Button>
  )
}

export function ArchiveButton({ materialId, archived }: { materialId: string; archived: boolean }) {
  const t = useT()
  return archived ? (
    <ConfirmActionButton title={t("Restore this material?")} description={t("It becomes visible again to everyone it is assigned or shared with.")} confirmLabel={t("Restore")} successMessage={t("Material restored.")} action={archiveMaterialAction.bind(null, { materialId, archived: false })}>
      <ArchiveRestoreIcon aria-hidden /> {t("Restore")}
    </ConfirmActionButton>
  ) : (
    <ConfirmActionButton
      title={t("Archive this material?")}
      description={t("Students and other teachers stop seeing it (assignments are kept and come back if you restore it). You can find it under Archived.")}
      confirmLabel={t("Archive")}
      successMessage={t("Material archived.")}
      action={archiveMaterialAction.bind(null, { materialId, archived: true })}
    >
      <ArchiveIcon aria-hidden /> {t("Archive")}
    </ConfirmActionButton>
  )
}

export function DeleteMaterialButton({ materialId }: { materialId: string }) {
  const t = useT()
  return (
    <ConfirmActionButton
      variant="ghost"
      title={t("Delete this material permanently?")}
      description={t("The file, its class assignments, shares and favourites are deleted. This cannot be undone; archive instead to keep it.")}
      confirmLabel={t("Delete")}
      successMessage={t("Material deleted.")}
      destructive
      action={deleteMaterialAction.bind(null, { materialId })}
    >
      <Trash2Icon aria-hidden /> {t("Delete")}
    </ConfirmActionButton>
  )
}

const ROOT = "__root"

export function MoveToFolder({ materialId, folderId, folders }: { materialId: string; folderId: string | null; folders: { id: string; path: string }[] }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      <FolderInputIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <div className="min-w-48 flex-1">
        <OptionSelect
          id="move-folder"
          ariaLabel={t("Folder")}
          value={folderId ?? ROOT}
          disabled={isPending}
          onChange={(value) =>
            startTransition(async () => {
              const result = await moveMaterialAction({ materialId, folderId: value === ROOT ? "" : value })
              if (result.ok) toast.success(t("Moved."))
              else toast.error(result.error.message)
            })
          }
          options={[{ id: ROOT, label: "No folder" }, ...folders.map((f) => ({ id: f.id, label: f.path }))]}
          placeholder={t("Folder")}
        />
      </div>
    </div>
  )
}
