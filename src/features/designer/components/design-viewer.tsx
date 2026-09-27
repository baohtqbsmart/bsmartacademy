"use client"

import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ExportDialog } from "@/features/designer/components/export-dialog"
import type { AssetUrls } from "@/features/designer/components/page-view"
import { Presenter } from "@/features/designer/components/presenter"
import type { DesignContent } from "@/features/designer/model"
import { useT } from "@/i18n/client"

/** Read-only presenting (own preview or a shared link), with PDF/PNG export. */
export function DesignViewer({ content, assets, title, allowAnswers }: { content: DesignContent; assets: AssetUrls; title: string; allowAnswers: boolean }) {
  const t = useT()
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <ExportDialog
          content={content}
          assets={assets}
          title={title}
          pageIndex={0}
          allowAnswers={allowAnswers}
          trigger={
            <Button variant="outline" size="sm">
              <DownloadIcon aria-hidden /> {t("Download")}
            </Button>
          }
        />
      </div>
      <Presenter content={content} assets={assets} title={title} className="h-[min(80dvh,56rem)] overflow-hidden rounded-lg border" />
    </div>
  )
}
