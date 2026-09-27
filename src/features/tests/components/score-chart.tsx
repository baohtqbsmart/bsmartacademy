"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// One series (students per score band) in validated palette slot 1; the card
// title names it, so there is no legend.
const config = { students: { label: "Students", color: "var(--series-1)" } } satisfies ChartConfig

export function ScoreDistributionChart({ data }: { data: { label: string; students: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} fontSize={11} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="students" fill="var(--color-students)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  )
}
