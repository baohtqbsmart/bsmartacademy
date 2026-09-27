"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, XAxis, YAxis } from "recharts"

import { OptionSelect } from "@/components/shared/option-select"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { Bucket } from "@/features/analytics/metrics"
import { useT } from "@/i18n/client"

// Single series per chart: validated palette slot 1; the card title names it.
const lineConfig = { average: { label: "Average percentage", color: "var(--series-1)" } } satisfies ChartConfig

type SeriesOption = { id: string; label: string; buckets: Bucket[] }

/**
 * Average percentage per week or month. Empty periods are gaps (the line is
 * not drawn through them) and the tooltip says how many results each point is.
 */
export function ProgressLineChart({ series, granularity, unit = "results" }: { series: SeriesOption[]; granularity: "week" | "month"; unit?: "results" | "students" }) {
  const t = useT()
  const [selected, setSelected] = useState(series[0]?.id ?? "")
  const current = series.find((s) => s.id === selected) ?? series[0]
  if (!current) return null
  const hasData = current.buckets.some((b) => b.average !== null)
  return (
    <div className="grid gap-3">
      {series.length > 1 && (
        <div className="w-56">
          <OptionSelect ariaLabel={t("Show results for")} id="progress-series" value={current.id} onChange={setSelected} options={series.map((s) => ({ id: s.id, label: s.label }))} placeholder={t("Show")} />
        </div>
      )}
      {hasData ? (
        <ChartContainer config={lineConfig} className="aspect-auto h-64 w-full">
          <LineChart data={current.buckets} accessibilityLayer margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(_v, _n, item) => {
                    const b = item.payload as Bucket
                    return (
                      <div className="grid gap-0.5">
                        <span className="font-medium tabular-nums">{b.average === null ? t("No results") : t("{average}% average", { average: b.average })}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {granularity === "week" ? t("Week of") : t("Month")} {t(b.label)} · {b.results} {unit}
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Line dataKey="average" type="linear" stroke="var(--color-average)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">{t("No percentage results in this period.")}</p>
      )}
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">{t("Show as a table")}</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 font-normal">{granularity === "week" ? t("Week of") : t("Month")}</th>
              <th className="py-1 font-normal">{t("Average")}</th>
              <th className="py-1 font-normal">{t("Based on")}</th>
            </tr>
          </thead>
          <tbody>
            {current.buckets.map((b) => (
              <tr key={b.key} className="border-t">
                <td className="py-1">{t(b.label)}</td>
                <td className="py-1">{b.average === null ? "—" : `${b.average}%`}</td>
                <td className="py-1">
                  {b.results} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

const radarConfig = { value: { label: "Average percentage", color: "var(--series-1)" } } satisfies ChartConfig

/** Only drawn for three or more skills with results; missing skills are left out, not plotted as zero. */
export function SkillRadarChart({ data }: { data: { skill: string; value: number; results: number }[] }) {
  const t = useT()
  return (
    <ChartContainer config={radarConfig} className="mx-auto aspect-square h-72 w-full max-w-sm">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid />
        <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} tickFormatter={(v: string) => t(v)} />
        <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={45} tick={{ fontSize: 10 }} axisLine={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const d = item.payload as { skill: string; value: number; results: number }
                return (
                  <span className="tabular-nums">
                    {t("{skill}: {value}% average of {results} result{value2}", { skill: d.skill, value: d.value, results: d.results, value2: d.results === 1 ? "" : "s" })}
                  </span>
                )
              }}
            />
          }
        />
        <Radar dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.25} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </RadarChart>
    </ChartContainer>
  )
}

const distributionConfig = { students: { label: "Students", color: "var(--series-1)" } } satisfies ChartConfig

/** How many students' averages fall in each range (counts only, no names). */
export function DistributionChart({ data }: { data: { label: string; students: number }[] }) {
  const t = useT()
  return (
    <ChartContainer config={distributionConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v: string) => t(v)} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator />} />
        <Bar dataKey="students" fill="var(--color-students)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}
