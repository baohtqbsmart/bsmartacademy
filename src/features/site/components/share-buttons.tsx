"use client"

import { CheckIcon, LinkIcon, Share2Icon } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

/**
 * Share a public page: Facebook, the phone's share sheet (Zalo, Messenger…
 * wherever the Web Share API exists) and copy link.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const t = useT()
  // The share sheet exists on phones; the server render assumes it does not.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false
  )
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(t("Link copied."))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("Could not copy. Select the link and copy it."))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("Share")}>
      <span className="text-muted-foreground mr-1 text-sm">{t("Share")}:</span>
      <Button asChild variant="outline" size="sm">
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
          Facebook
        </a>
      </Button>
      {canShare && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigator.share({ title, url }).catch(() => undefined)}
        >
          <Share2Icon aria-hidden /> {t("Zalo, Messenger…")}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <CheckIcon aria-hidden /> : <LinkIcon aria-hidden />} {t("Copy link")}
      </Button>
    </div>
  )
}
