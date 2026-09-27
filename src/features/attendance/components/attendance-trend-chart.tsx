"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// One series (attendance rate), one colour: validated palette slot 1. The
// card title names it, so there is no legend.
const config = {
  rate: { label: "Attendance rate", color: "var(--series-1)" },
} satisfies ChartConfig

type Week = { label: string; rate: number | null; present: number; late: number; absent: number; excused: number }

export function AttendanceTrendChart({ data }: { data: Week[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_value, _name, item) => <WeekTooltip week={item.payload as Week} />}
            />
          }
        />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  )
}

function WeekTooltip({ week }: { week: Week }) {
  return (
    <div className="grid min-w-36 gap-1">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Attendance rate</span>
        <span className="font-medium tabular-nums">{week.rate === null ? "—" : `${week.rate}%`}</span>
      </div>
      <div className="text-muted-foreground tabular-nums">
        {week.present} present · {week.late} late · {week.absent} absent · {week.excused} excused
      </div>
    </div>
  )
}
