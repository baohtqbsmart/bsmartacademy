"use client"

import { PrinterIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useT } from "@/i18n/client"

type Datum = { label: string; value: number | null; detail?: string }

// One series per chart (validated palette slot 1); the card title names it.
const config = { value: { label: "Value", color: "var(--series-1)" } } satisfies ChartConfig
const money = (v: number) => `${Math.round(v).toLocaleString("vi-VN")} đ`
const compactMoney = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10} tr` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

/** Width that fits an A4 page at 96 dpi with the app's margins. */
const PRINT_WIDTH = 680

/** Charts measure the screen; when printing they are redrawn at a fixed page width so nothing is cut off. */
function usePrinting() {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [])
  return printing
}

/** Bars from the report's own rows. Percent charts are fixed at 0–100%; missing values are gaps, not zeros. */
export function ReportChart({ kind, data }: { kind: "attendance" | "money"; data: Datum[] }) {
  const t = useT()
  const printing = usePrinting()
  if (!data.some((d) => d.value !== null && d.value > 0)) return <p className="text-muted-foreground py-8 text-center text-sm">{t("No data for these filters.")}</p>
  const yAxis = (
    <YAxis
      domain={kind === "attendance" ? [0, 100] : [0, "auto"]}
      ticks={kind === "attendance" ? [0, 25, 50, 75, 100] : undefined}
      tickLine={false}
      axisLine={false}
      width={kind === "money" ? 56 : 48}
      tickFormatter={(v: number) => (kind === "attendance" ? `${v}%` : compactMoney(v))}
    />
  )
  if (printing)
    return (
      <BarChart width={PRINT_WIDTH} height={220} data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={8} />
        {yAxis}
        <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    )
  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={8} />
        <YAxis
          domain={kind === "attendance" ? [0, 100] : [0, "auto"]}
          ticks={kind === "attendance" ? [0, 25, 50, 75, 100] : undefined}
          tickLine={false}
          axisLine={false}
          width={kind === "money" ? 52 : 40}
          tickFormatter={(v: number) => (kind === "attendance" ? `${v}%` : compactMoney(v))}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as Datum
                return (
                  <div className="grid gap-0.5 tabular-nums">
                    <span className="font-medium">{d.value === null ? t("No data") : kind === "attendance" ? `${d.value}%` : money(d.value)}</span>
                    {d.detail && <span className="text-muted-foreground">{d.detail}</span>}
                  </div>
                )
              }}
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

export function PrintButton() {
  const t = useT()
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon aria-hidden /> {t("Print")}
    </Button>
  )
}
