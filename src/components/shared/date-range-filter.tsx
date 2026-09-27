"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isIsoDate } from "@/lib/dates"
import { withParams } from "@/lib/search-params"

type DateRangeFilterProps = {
  basePath: string
  from: string
  to: string
  /** Latest selectable date (usually today). */
  max?: string
  /** Other query parameters to keep. */
  preserve?: Record<string, string | undefined>
}

/** "From / to" date inputs that write ?from=&to= to the URL. */
export function DateRangeFilter({ basePath, from, to, max, preserve = {} }: DateRangeFilterProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function change(key: "from" | "to", value: string) {
    if (!isIsoDate(value)) return
    startTransition(() => router.replace(withParams(basePath, { ...preserve, from, to, [key]: value }), { scroll: false }))
  }

  return (
    <div className="flex flex-wrap items-end gap-2" aria-busy={isPending}>
      <div className="grid gap-1">
        <Label htmlFor="range-from" className="text-muted-foreground text-xs font-normal">
          From
        </Label>
        <Input key={from} id="range-from" type="date" className="w-40" defaultValue={from} max={to} onChange={(e) => change("from", e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="range-to" className="text-muted-foreground text-xs font-normal">
          To
        </Label>
        <Input key={to} id="range-to" type="date" className="w-40" defaultValue={to} min={from} max={max} onChange={(e) => change("to", e.target.value)} />
      </div>
    </div>
  )
}
