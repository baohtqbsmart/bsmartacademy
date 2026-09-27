import { Card, CardContent } from "@/components/ui/card"
import { formatVnd } from "@/lib/money"
import { cn } from "@/lib/utils"
import { getT } from "@/i18n/server"

export type StatTile = {
  label: string
  /** For "percent": a share between 0 and 1; null shows "—". */
  value: number | null
  /** "money" renders đồng; "count" a plain number; "percent" a percentage. */
  kind?: "money" | "count" | "percent"
  hint?: string
  tone?: "default" | "critical"
}

function formatValue(tile: StatTile) {
  if (tile.value === null) return "—"
  if (tile.kind === "count") return tile.value.toLocaleString("vi-VN")
  if (tile.kind === "percent") return `${Math.round(tile.value * 100)}%`
  return formatVnd(tile.value)
}

/** Headline figures: the number is the chart. */
export async function StatTiles({ tiles }: { tiles: StatTile[] }) {
  const t = await getT()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label} className="gap-1 py-4">
          <CardContent className="grid gap-1 px-4">
            <span className="text-muted-foreground text-xs">{t(tile.label)}</span>
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                tile.tone === "critical" && (tile.value ?? 0) > 0 && "text-[#b02a2a] dark:text-[#ef7b7b]"
              )}
            >
              {formatValue(tile)}
            </span>
            {tile.hint && <span className="text-muted-foreground text-xs">{t(tile.hint)}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
