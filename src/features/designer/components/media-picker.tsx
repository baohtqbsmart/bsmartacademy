"use client"

import { FilmIcon, Loader2Icon, Trash2Icon, UploadIcon, Volume2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { removeAssetAction } from "@/features/designer/actions"
import type { AssetInfo } from "@/features/designer/server/design-service"
import { acceptFor, uploadDesignFile, type Media } from "@/features/designer/uploads"
import { UPLOAD_RULES } from "@/lib/uploads"

const TITLES: Record<Media, string> = { image: "Pictures", audio: "Audio", video: "Video" }

/**
 * Chooses (or uploads) a file of this design. Videos can also be a YouTube,
 * Vimeo or other https:// link. Files still used on a page cannot be removed.
 */
export function MediaPicker({
  designId,
  media,
  assets,
  onAssetsChange,
  onChoose,
  onChooseLink,
  onClose,
}: {
  designId: string
  media: Media | null
  assets: Record<string, AssetInfo>
  onAssetsChange: (assets: Record<string, AssetInfo>) => void
  onChoose: (assetId: string) => void
  onChooseLink: (url: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState("")
  const files = media ? Object.values(assets).filter((a) => a.media === media) : []

  async function upload(list: FileList) {
    if (!media) return
    setBusy(true)
    let next = assets
    let last: string | null = null
    for (const file of list) {
      try {
        const asset = await uploadDesignFile(designId, file, media)
        next = { ...next, [asset.id]: asset }
        last = asset.id
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.")
      }
    }
    onAssetsChange(next)
    setBusy(false)
    // One file uploaded: use it straight away.
    if (last && list.length === 1) onChoose(last)
  }

  async function remove(asset: AssetInfo) {
    const result = await removeAssetAction({ assetId: asset.id })
    if (!result.ok) return void toast.error(result.error.message)
    const next = { ...assets }
    delete next[asset.id]
    onAssetsChange(next)
    toast.success("File removed.")
  }

  return (
    <Dialog open={media !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{media ? TITLES[media] : ""}</DialogTitle>
          <DialogDescription>Files belong to this design. Up to {UPLOAD_RULES.maxBytes / 1024 / 1024} MB each; each file&apos;s content is checked before it is accepted.</DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={media ? acceptFor(media) : undefined}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files)
            e.target.value = ""
          }}
        />
        <div>
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <UploadIcon aria-hidden />} {busy ? "Uploading…" : "Upload from this device"}
          </Button>
        </div>

        {media === "video" && (
          <form
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (/^https:\/\/[^\s<>"]+$/.test(link.trim())) onChooseLink(link.trim())
              else toast.error("Paste a link starting with https://")
            }}
          >
            <Label htmlFor="video-link">…or paste a video link</Label>
            <div className="flex gap-2">
              <Input id="video-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
              <Button type="submit" variant="outline">
                Add link
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">YouTube and Vimeo play inside the page; other links open in a new tab.</p>
          </form>
        )}

        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">No {media === "image" ? "pictures" : media} uploaded to this design yet.</p>
        ) : (
          <ul className={media === "image" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "grid gap-2"}>
            {files.map((asset) => (
              <li key={asset.id} className="group relative">
                <button type="button" onClick={() => onChoose(asset.id)} className="hover:ring-primary w-full overflow-hidden rounded-md border text-left hover:ring-2">
                  {media === "image" ? (
                    asset.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                      <img src={asset.url} alt={asset.fileName} className="aspect-square w-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground flex aspect-square items-center justify-center text-xs">Unavailable</span>
                    )
                  ) : (
                    <span className="flex items-center gap-2 p-2 text-sm">
                      {media === "audio" ? <Volume2Icon className="size-4" aria-hidden /> : <FilmIcon className="size-4" aria-hidden />}
                      <span className="truncate">{asset.fileName}</span>
                    </span>
                  )}
                  <span className="sr-only">Use {asset.fileName}</span>
                </button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-1 right-1 size-7 opacity-80"
                  aria-label={`Remove ${asset.fileName}`}
                  onClick={() => void remove(asset)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
