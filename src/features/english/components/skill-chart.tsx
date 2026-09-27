"use client"

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// One series (average %), validated palette slot 1; skills label the bars, so
// no legend. Skills not practised yet have no bar and read "no data".
const config = { average: { label: "Average", color: "var(--series-1)" } } satisfies ChartConfig

export function SkillChart({ data }: { data: { skill: string; average: number | null; activities: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} layout="vertical" accessibilityLayer margin={{ left: 8, right: 48 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="skill" tickLine={false} axisLine={false} width={104} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_value, _name, item) => {
                const row = item.payload as { average: number | null; activities: number }
                return row.average === null ? "No activity yet" : `${row.average}% average · ${row.activities} activities`
              }}
            />
          }
        />
        <Bar dataKey="average" fill="var(--color-average)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList
            dataKey="average"
            position="right"
            className="fill-foreground text-xs"
            formatter={(value: unknown) => (value === null || value === undefined ? "no data" : `${value}%`)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
