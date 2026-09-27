import { InfoIcon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ASSESSED_BY_LABELS, MIN_GROUP, MIN_RESULTS, SKILL_NAMES, SOURCES, type Comparison, type GroupSummary, type Result, type SkillSummary, type Summary } from "@/features/analytics/metrics"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

/** What kind of number a card shows — always printed on the card. */
export type Measure = "Average percentage" | "Percentage" | "Rate" | "Raw score" | "Level" | "Teacher assessment" | "Count" | "Band"

export function ScoreCard({
  label,
  measure,
  value,
  basis,
  comparison,
  warning,
}: {
  label: string
  measure: Measure
  value: string
  /** What the value is based on: "average of 12 results". */
  basis: string
  comparison?: { text: string; delta: number | null; lowConfidence?: boolean } | null
  warning?: string | null
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-1 px-4">
        <span className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">{label}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {measure}
          </Badge>
        </span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{basis}</span>
        {comparison && (
          <span className="text-xs tabular-nums">
            {comparison.text}
            {comparison.delta !== null && (
              <span className={cn("ml-1 font-medium", comparison.delta > 0 && "text-emerald-700 dark:text-emerald-400", comparison.delta < 0 && "text-[#b02a2a] dark:text-[#ef7b7b]")}>
                ({comparison.delta > 0 ? "▲ +" : comparison.delta < 0 ? "▼ " : ""}
                {comparison.delta} pts)
              </span>
            )}
            {comparison.lowConfidence && <span className="text-muted-foreground"> · few results, read with care</span>}
          </span>
        )}
        {warning && (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="size-3" aria-hidden /> {warning}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

export const pct = (v: number | null) => (v === null ? "—" : `${v}%`)
export const rate = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

export function averageBasis(s: Summary) {
  if (s.scored === 0) return "No results with a score in this period"
  return `Average of ${s.scored} result${s.scored === 1 ? "" : "s"}`
}

export function comparisonOf(c: Comparison, previousLabel: string) {
  return { text: `${previousLabel}: ${pct(c.previous)}`, delta: c.delta, lowConfidence: c.lowConfidence && c.delta !== null }
}

/** One progress bar per English skill; skills without results say so. */
export function SkillBars({ skills, previous }: { skills: SkillSummary[]; previous?: Map<string, number | null> }) {
  return (
    <ul className="grid gap-3">
      {skills.map((s) => {
        const before = previous?.get(s.skill) ?? null
        return (
          <li key={s.skill} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium">{SKILL_NAMES[s.skill]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {s.scored > 0 ? (
                  <>
                    <span className="text-foreground font-medium">{s.averagePercent}%</span> average of {s.scored} · {s.teacherAssessed} teacher-assessed, {s.automatic} automatic
                    {before !== null && ` · before: ${before}%`}
                  </>
                ) : s.bandResults > 0 ? (
                  "Band results only (see below)"
                ) : (
                  "No results yet"
                )}
              </span>
            </div>
            <div
              className="bg-muted h-2.5 overflow-hidden rounded-full"
              role="meter"
              aria-label={`${SKILL_NAMES[s.skill]} average`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.averagePercent ?? undefined}
              aria-valuetext={s.averagePercent === null ? "No results" : `${s.averagePercent}% average of ${s.scored} results`}
            >
              {s.averagePercent !== null && <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${s.averagePercent}%` }} />}
            </div>
            {s.bandResults > 0 && (
              <span className="text-muted-foreground text-xs">
                IELTS-style band: mean {s.averageBand} over {s.bandResults} task{s.bandResults === 1 ? "" : "s"} (teacher assessment; practice marking, not an official score)
              </span>
            )}
            {s.lowConfidence && <span className="text-muted-foreground text-xs">Fewer than {MIN_RESULTS} results — read with care.</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** Group version: averages of students, withheld for small groups. */
export function GroupSkillBars({ skills }: { skills: ({ skill: string } & GroupSummary)[] }) {
  return (
    <ul className="grid gap-3">
      {skills.map((s) => (
        <li key={s.skill} className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{SKILL_NAMES[s.skill as keyof typeof SKILL_NAMES]}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {s.suppressed ? (
                s.studentsWithResults === 0 ? "No results" : `Not shown: ${s.studentsWithResults} student${s.studentsWithResults === 1 ? "" : "s"} with results (fewer than ${MIN_GROUP})`
              ) : (
                <>
                  <span className="text-foreground font-medium">{s.averageOfStudents}%</span> average of {s.studentsWithResults} students
                </>
              )}
            </span>
          </div>
          <div className="bg-muted h-2.5 overflow-hidden rounded-full" aria-hidden>
            {!s.suppressed && <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${s.averageOfStudents}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SourceTable({ rows }: { rows: ({ source: keyof typeof SOURCES; latest: Result | null } & Summary)[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-2 font-normal">Source</th>
            <th className="py-2 font-normal">How it is marked</th>
            <th className="py-2 text-right font-normal">Results</th>
            <th className="py-2 text-right font-normal">Average percentage</th>
            <th className="py-2 text-right font-normal">Latest raw score</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.source} className="border-t">
              <td className="py-2 font-medium">{SOURCES[r.source].label}</td>
              <td className="text-muted-foreground py-2 text-xs">{SOURCES[r.source].marking}</td>
              <td className="py-2 text-right">{r.results}</td>
              <td className="py-2 text-right">
                {pct(r.averagePercent)}
                {r.bandResults > 0 && <span className="text-muted-foreground block text-xs">band mean {r.averageBand} ({r.bandResults})</span>}
              </td>
              <td className="py-2 text-right">{r.latest ? rawScore(r.latest) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function rawScore(r: Result) {
  return r.band !== null ? `Band ${r.band}` : `${trim(r.rawScore)} / ${trim(r.maxScore)}`
}
const trim = (v: number) => String(Math.round(v * 100) / 100)

/** Every result behind the numbers above. */
export function ResultsTable({ results }: { results: Result[] }) {
  const sorted = [...results].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
  if (sorted.length === 0) return <p className="text-muted-foreground text-sm">No results in this period.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-2 font-normal">Date</th>
            <th className="py-2 font-normal">Work</th>
            <th className="py-2 font-normal">Source · skill</th>
            <th className="py-2 text-right font-normal">Raw score</th>
            <th className="py-2 text-right font-normal">Percentage</th>
            <th className="py-2 font-normal">Marked by</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sorted.map((r, i) => (
            <tr key={`${r.itemId}-${r.occurredOn}-${i}`} className="border-t">
              <td className="py-2 whitespace-nowrap">{formatDate(r.occurredOn)}</td>
              <td className="py-2">{r.title}</td>
              <td className="text-muted-foreground py-2 text-xs">
                {SOURCES[r.source]?.label ?? r.source}
                {r.skill && ` · ${SKILL_NAMES[r.skill as keyof typeof SKILL_NAMES] ?? r.skill.replaceAll("_", " ")}`}
              </td>
              <td className="py-2 text-right whitespace-nowrap">{rawScore(r)}</td>
              <td className="py-2 text-right">{r.band !== null ? <span className="text-muted-foreground text-xs">band, no %</span> : `${r.percent}%`}</td>
              <td className="py-2 text-xs">
                {r.assessedBy === "teacher" ? (
                  <Badge variant="secondary" className="font-normal">
                    Teacher{r.assessor ? `: ${r.assessor}` : ""}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">{ASSESSED_BY_LABELS[r.assessedBy] ?? r.assessedBy}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The glossary required on every analytics page. */
export function Definitions({ group = false }: { group?: boolean }) {
  const items: [string, string][] = [
    ["Raw score", "The marks as given, e.g. 7.5 / 10 or an IELTS-style band."],
    ["Percentage", "Raw score ÷ maximum × 100 for one piece of work."],
    ["Average", group ? "Each student's own average first, then the mean of those — so no student counts more for doing more work. Always shown with how many students it covers." : "The plain mean of percentages, always shown with how many results it covers."],
    ["Level", "The English level recorded by staff on the student's profile. It is not calculated from these scores."],
    ["Teacher assessment", "Marked by a teacher (with a rubric for writing and speaking). Automatic results come from exercises and tests the system marks."],
    ["Bands", "IELTS-style bands are practice marking by teachers, never converted to percentages or mixed into averages, and not official IELTS scores."],
  ]
  return (
    <Card className="gap-2 py-4">
      <CardContent className="grid gap-2 px-4 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <InfoIcon className="size-4" aria-hidden /> How to read these numbers
        </span>
        <dl className="grid gap-1.5 sm:grid-cols-2">
          {items.map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground text-xs">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground text-xs">
          Only published results count: returned assignment and writing/speaking grades, graded tests (best attempt), reviewed English work and practice results. Work a teacher has not returned is not included.
          {group && ` Group figures are withheld when fewer than ${MIN_GROUP} students have results, so no one's scores can be singled out.`}
        </p>
      </CardContent>
    </Card>
  )
}
