"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatVnd, formatVndCompact } from "@/lib/money"
import { useT } from "@/i18n/client"

// Series colours are validated palette slots 1 and 2 (see globals.css), which
// step for dark mode. One unit (đồng) => one y-axis.
const monthlyConfig = {
  expected: { label: "Expected", color: "var(--series-1)" },
  collected: { label: "Collected", color: "var(--series-2)" },
} satisfies ChartConfig

export function MonthlyRevenueChart({
  data,
}: {
  data: { label: string; expected: number; collected: number }[]
}) {
  return (
    <ChartContainer config={monthlyConfig} className="aspect-auto h-72 w-full">
      <BarChart data={data} barGap={2} barCategoryGap="24%" accessibilityLayer margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => formatVndCompact(value)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={<ChartTooltipContent formatter={(value, name) => <TooltipRow name={String(name)} value={Number(value)} />} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="expected" fill="var(--color-expected)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  )
}

const methodConfig = {
  amount: { label: "Collected", color: "var(--series-1)" },
} satisfies ChartConfig

/** One series (collected), one colour; the method names label the bars. */
export function MethodChart({ data }: { data: { label: string; amount: number }[] }) {
  const t = useT()
  return (
    <ChartContainer config={methodConfig} className="aspect-auto h-44 w-full">
      <BarChart data={data} layout="vertical" accessibilityLayer margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value: number) => formatVndCompact(value)} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={96} tickFormatter={(v: string) => t(v)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={<ChartTooltipContent hideIndicator formatter={(value) => formatVnd(Number(value))} />}
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  )
}

function TooltipRow({ name, value }: { name: string; value: number }) {
  const t = useT()
  const label = monthlyConfig[name as keyof typeof monthlyConfig]?.label ?? name
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{t(label)}</span>
      <span className="font-medium tabular-nums">{formatVnd(value)}</span>
    </div>
  )
}
