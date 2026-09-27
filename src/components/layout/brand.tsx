import Image from "next/image"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

/*
 * The BSmart Academy logo is used exactly as supplied: no recolouring, no
 * filters, no redrawing. On dark surfaces it sits on the cream brand tile.
 */

/** The "B" mark on a cream tile, so it stays legible on light and dark surfaces. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-cream)] ring-1 ring-black/5",
        className
      )}
    >
      <Image src="/brand/logo-mark.png" alt="" width={256} height={256} className="size-[72%]" priority />
    </span>
  )
}

/** Full logo (mark above the "BSMART ACADEMY" wordmark). */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-full.png"
      alt={siteConfig.name}
      width={900}
      height={914}
      className={cn("h-auto dark:rounded-2xl dark:bg-[var(--brand-cream)] dark:p-3", className)}
      priority
    />
  )
}

/** Mark and wordmark side by side (both cut unchanged from the logo), for headers. */
export function BrandLockup({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 dark:rounded-xl dark:bg-[var(--brand-cream)] dark:px-2 dark:py-1", className)}>
      <Image src="/brand/logo-mark.png" alt="" width={256} height={256} className={cn("size-10 shrink-0", markClassName)} priority />
      <Image src="/brand/logo-wordmark.png" alt={siteConfig.name} width={515} height={160} className="h-7 w-auto" priority />
    </span>
  )
}
