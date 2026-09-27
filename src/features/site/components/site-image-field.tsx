"use client"

import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"
import { useRef, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import type { ActionResult } from "@/lib/action-result"
import { publicMediaUrl, SITE_MEDIA_BUCKET } from "@/lib/public-media"
import { createClient } from "@/lib/supabase/client"

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const TYPES = Object.keys(EXTENSIONS)
const MAX_BYTES = 5 * 1024 * 1024

/**
 * A website picture: uploads to the public site-media bucket (bucket policies
 * allow only site editors), then saves the path with a Server Action.
 */
export function SiteImageField({
  folder,
  path,
  onSave,
  fallback,
}: {
  folder: "hero" | "subjects" | "teachers" | "articles"
  path: string | null
  onSave: (path: string | null) => Promise<ActionResult<unknown>>
  /** Shown when no picture is set (the default illustration). */
  fallback: React.ReactNode
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const url = publicMediaUrl(path)

  function save(next: string | null, done: string) {
    startTransition(async () => {
      const result = await onSave(next)
      if (result.ok) toast.success(t(done))
      else toast.error(result.error.message)
    })
  }

  function handleFile(file: File) {
    if (!TYPES.includes(file.type)) return void toast.error(t("Please choose a PNG, JPEG or WebP image."))
    if (file.size > MAX_BYTES) return void toast.error(t("Website pictures must be 5 MB or smaller."))
    startTransition(async () => {
      const objectPath = `${folder}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`
      const { error } = await createClient().storage.from(SITE_MEDIA_BUCKET).upload(objectPath, file, { contentType: file.type, upsert: false })
      if (error) return void toast.error(t("Upload failed. Please try again."))
      const result = await onSave(objectPath)
      if (result.ok) toast.success(t("Picture updated."))
      else toast.error(result.error.message)
    })
  }

  return (
    <div className="grid gap-3">
      <div className="bg-muted relative aspect-[16/9] overflow-hidden rounded-lg border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public storage URL
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          fallback
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) handleFile(file)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => inputRef.current?.click()}>
          {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : url ? <UploadIcon aria-hidden /> : <ImageIcon aria-hidden />}
          {url ? t("Replace picture") : t("Upload a picture")}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => save(null, "Picture removed.")}>
            <Trash2Icon aria-hidden /> {t("Use the illustration")}
          </Button>
        )}
      </div>
    </div>
  )
}
