"use client"

import { CopyIcon, Link2Icon, Link2OffIcon, RefreshCwIcon, Share2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { designSharedPath } from "@/config/routes"
import { sharingAction } from "@/features/designer/actions"
import { useT } from "@/i18n/client"

export function ShareDialog({ designId, initialToken }: { designId: string; initialToken: string | null }) {
  const t = useT()
  const [token, setToken] = useState(initialToken)
  const [isPending, startTransition] = useTransition()
  const link = token && typeof window !== "undefined" ? `${window.location.origin}${designSharedPath(token)}` : null

  function change(mode: "on" | "off" | "reset") {
    startTransition(async () => {
      const result = await sharingAction({ designId, mode })
      if (!result.ok) return void toast.error(result.error.message)
      setToken(result.data)
      toast.success(t(mode === "off" ? "Sharing stopped. The old link no longer works." : mode === "reset" ? "New link created. The old one no longer works." : "Share link created."))
    })
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t("Link copied."))
    } catch {
      toast.error(t("Could not copy. Select the link and copy it."))
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2Icon aria-hidden /> {t("Share")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Share")}</DialogTitle>
          <DialogDescription>
            {t("Anyone signed in to BSmart who has the link can view and present this design (read-only), including students and parents. It is not public on the internet. The shared copy includes hidden answers, so pupils could find them.")}
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input readOnly value={link ?? ""} aria-label={t("Share link")} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={copy} aria-label={t("Copy link")}>
                <CopyIcon />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("Viewers always see the latest saved version.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => change("reset")} disabled={isPending}>
                <RefreshCwIcon aria-hidden /> {t("New link")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => change("off")} disabled={isPending}>
                <Link2OffIcon aria-hidden /> {t("Stop sharing")}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => change("on")} disabled={isPending}>
            <Link2Icon aria-hidden /> {t("Create share link")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
