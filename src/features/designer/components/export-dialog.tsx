"use client"

import { BanIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { AssetUrls } from "@/features/designer/components/page-view"
import { EXPORT_FORMATS, EXPORT_MEDIA_NOTE, exportDesign, type ExportFormat } from "@/features/designer/export"
import type { DesignContent } from "@/features/designer/model"
import { cn } from "@/lib/utils"

export function ExportDialog({
  content,
  assets,
  title,
  pageIndex,
  allowAnswers,
  trigger,
}: {
  content: DesignContent
  assets: AssetUrls
  title: string
  pageIndex: number
  /** Teachers can include hidden items and correct answers. */
  allowAnswers: boolean
  trigger: React.ReactNode
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [showAnswers, setShowAnswers] = useState(false)
  const [busy, setBusy] = useState(false)
  const hasAnswers = content.pages.some((p) => p.elements.some((el) => el.hidden || el.type === "question"))

  async function run() {
    if (format !== "pdf" && format !== "png") return
    setBusy(true)
    try {
      await exportDesign({ format, content, assets, title, pageIndex, showAnswers: allowAnswers && showAnswers })
      toast.success(format === "pdf" ? "PDF downloaded." : "Image downloaded.")
    } catch (error) {
      console.error("[designer] export failed", error)
      toast.error("The export failed. If the design has pictures, reload the page (their links may have expired) and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Files are created in your browser from the saved look of each page. {EXPORT_MEDIA_NOTE}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Format" className="grid gap-2">
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((key) => {
            const f = EXPORT_FORMATS[key]
            const selected = format === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={!f.supported}
                disabled={!f.supported}
                onClick={() => setFormat(key)}
                className={cn(
                  "grid gap-0.5 rounded-lg border p-3 text-left text-sm",
                  selected && "border-primary ring-primary/30 ring-2",
                  !f.supported && "bg-muted/50 text-muted-foreground cursor-not-allowed"
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  {!f.supported && <BanIcon className="size-4" aria-hidden />}
                  {f.label}
                  {!f.supported && <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-normal">Not supported</span>}
                </span>
                <span className="text-muted-foreground text-xs">{key === "png" ? `Page ${pageIndex + 1} as a picture.` : f.note}</span>
              </button>
            )
          })}
        </div>
        {allowAnswers && hasAnswers && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showAnswers} onCheckedChange={(v) => setShowAnswers(v === true)} /> Include answers and hidden items (teacher copy)
          </label>
        )}
        <DialogFooter>
          <Button onClick={run} disabled={busy || !EXPORT_FORMATS[format].supported}>
            {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <DownloadIcon aria-hidden />} {busy ? "Preparing…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
