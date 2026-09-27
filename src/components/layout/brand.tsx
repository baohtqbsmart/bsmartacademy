import Image from "next/image"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

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

/** Full logo (mark + "BSMART ACADEMY" wordmark); lightened on dark surfaces. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-full.png"
      alt={siteConfig.name}
      width={900}
      height={914}
      className={cn("h-auto dark:brightness-[1.7] dark:saturate-[0.8]", className)}
      priority
    />
  )
}
