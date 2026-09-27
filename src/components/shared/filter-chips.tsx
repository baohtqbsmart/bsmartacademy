import Link from "next/link"

import { cn } from "@/lib/utils"

export type FilterChip = { href: string; label: string; active: boolean; count?: number }

/** Pill tabs that filter a list through the URL (works without JavaScript). */
export function FilterChips({ chips, label }: { chips: FilterChip[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={chip.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200",
            chip.active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card hover:border-primary/40 hover:text-primary"
          )}
        >
          {chip.label}
          {chip.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", chip.active ? "bg-white/20" : "bg-muted text-muted-foreground")}>{chip.count}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
