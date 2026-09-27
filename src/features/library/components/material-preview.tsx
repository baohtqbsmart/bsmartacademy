import { EyeOffIcon } from "lucide-react"

import { previewMode } from "@/features/library/catalog"
import { getT } from "@/i18n/server"

/**
 * Inline preview from a short-lived signed link. Files are served from the
 * storage domain (not the app's), with the type checked at upload. Word and
 * PowerPoint are not previewed: that would mean sending the file to an online
 * viewer outside the academy.
 */
export async function MaterialPreview({ kind, url, title }: { kind: string; url: string | null; title: string }) {
  const t = await getT()
  const mode = previewMode(kind)
  if (!url || !mode)
    return (
      <div className="bg-muted text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg p-6 text-center text-sm">
        <EyeOffIcon className="size-6" aria-hidden />
        {url ? t("No preview for Word or PowerPoint files — download it to open.") : t("The file is not available.")}
      </div>
    )
  switch (mode) {
    case "pdf":
      return <iframe src={url} title={t("Preview of {title}", { title })} className="h-[70dvh] w-full rounded-lg border bg-white" />
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
      return <img src={url} alt={title} className="max-h-[70dvh] w-full rounded-lg border bg-white object-contain" />
    case "audio":
      return <audio controls src={url} className="w-full" aria-label={title} />
    case "video":
      return <video controls src={url} className="max-h-[70dvh] w-full rounded-lg border bg-black" aria-label={title} />
  }
}
