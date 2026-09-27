import { InfoIcon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ASSESSED_BY_LABELS, MIN_GROUP, MIN_RESULTS, SKILL_NAMES, SOURCES, type Comparison, type GroupSummary, type Result, type SkillSummary, type Summary } from "@/features/analytics/metrics"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getT } from "@/i18n/server"

/** What kind of number a card shows — always printed on the card. */
export type Measure = "Average percentage" | "Percentage" | "Rate" | "Raw score" | "Level" | "Teacher assessment" | "Count" | "Band"

export async function ScoreCard({
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
  const t = await getT()
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-1 px-4">
        <span className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">{t(label)}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {t(measure)}
          </Badge>
        </span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{t(basis)}</span>
        {comparison && (
          <span className="text-xs tabular-nums">
            {t(comparison.text)}
            {comparison.delta !== null && (
              <span className={cn("ml-1 font-medium", comparison.delta > 0 && "text-emerald-700 dark:text-emerald-400", comparison.delta < 0 && "text-[#b02a2a] dark:text-[#ef7b7b]")}>
                {t("({value}{delta} pts)", { value: comparison.delta > 0 ? "▲ +" : comparison.delta < 0 ? "▼ " : "", delta: comparison.delta })}
              </span>
            )}
            {comparison.lowConfidence && <span className="text-muted-foreground"> {t("· few results, read with care")}</span>}
          </span>
        )}
        {warning && (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="size-3" aria-hidden /> {t(warning)}
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
export async function SkillBars({ skills, previous }: { skills: SkillSummary[]; previous?: Map<string, number | null> }) {
  const t = await getT()
  return (
    <ul className="grid gap-3">
      {skills.map((s) => {
        const before = previous?.get(s.skill) ?? null
        return (
          <li key={s.skill} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium">{t(SKILL_NAMES[s.skill])}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {s.scored > 0 ? (
                  <>
                    <span className="text-foreground font-medium">{s.averagePercent}%</span> {t("average of {scored} · {teacherAssessed} teacher-assessed, {automatic} automatic", { scored: s.scored, teacherAssessed: s.teacherAssessed, automatic: s.automatic })}
                    {before !== null && t(" · before: {before}%", { before })}
                  </>
                ) : s.bandResults > 0 ? (
                  t("Band results only (see below)")
                ) : (
                  t("No results yet")
                )}
              </span>
            </div>
            <div
              className="bg-muted h-2.5 overflow-hidden rounded-full"
              role="meter"
              aria-label={t("{value} average", { value: SKILL_NAMES[s.skill] })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.averagePercent ?? undefined}
              aria-valuetext={s.averagePercent === null ? "No results" : `${s.averagePercent}% average of ${s.scored} results`}
            >
              {s.averagePercent !== null && <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${s.averagePercent}%` }} />}
            </div>
            {s.bandResults > 0 && (
              <span className="text-muted-foreground text-xs">
                {t("IELTS-style band: mean")} {s.averageBand} {t("over {bandResults} task{value} (teacher assessment; practice marking, not an official score)", { bandResults: s.bandResults, value: s.bandResults === 1 ? "" : "s" })}
              </span>
            )}
            {s.lowConfidence && <span className="text-muted-foreground text-xs">{t("Fewer than {MIN_RESULTS} results — read with care.", { MIN_RESULTS })}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** Group version: averages of students, withheld for small groups. */
export async function GroupSkillBars({ skills }: { skills: ({ skill: string } & GroupSummary)[] }) {
  const t = await getT()
  return (
    <ul className="grid gap-3">
      {skills.map((s) => (
        <li key={s.skill} className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{t(SKILL_NAMES[s.skill as keyof typeof SKILL_NAMES])}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {s.suppressed ? (
                s.studentsWithResults === 0 ? t("No results") : t("Not shown: {studentsWithResults} student{value} with results (fewer than {MIN_GROUP})", { studentsWithResults: s.studentsWithResults, value: s.studentsWithResults === 1 ? "" : "s", MIN_GROUP })
              ) : (
                <>
                  <span className="text-foreground font-medium">{s.averageOfStudents}%</span> {t("average of {studentsWithResults} students", { studentsWithResults: s.studentsWithResults })}
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

export async function SourceTable({ rows }: { rows: ({ source: keyof typeof SOURCES; latest: Result | null } & Summary)[] }) {
  const t = await getT()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-2 font-normal">{t("Source")}</th>
            <th className="py-2 font-normal">{t("How it is marked")}</th>
            <th className="py-2 text-right font-normal">{t("Results")}</th>
            <th className="py-2 text-right font-normal">{t("Average percentage")}</th>
            <th className="py-2 text-right font-normal">{t("Latest raw score")}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.source} className="border-t">
              <td className="py-2 font-medium">{t(SOURCES[r.source].label)}</td>
              <td className="text-muted-foreground py-2 text-xs">{SOURCES[r.source].marking}</td>
              <td className="py-2 text-right">{r.results}</td>
              <td className="py-2 text-right">
                {pct(r.averagePercent)}
                {r.bandResults > 0 && <span className="text-muted-foreground block text-xs">{t("band mean")} {r.averageBand} ({r.bandResults})</span>}
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
export async function ResultsTable({ results }: { results: Result[] }) {
  const t = await getT()
  const sorted = [...results].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
  if (sorted.length === 0) return <p className="text-muted-foreground text-sm">{t("No results in this period.")}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-2 font-normal">{t("Date")}</th>
            <th className="py-2 font-normal">{t("Work")}</th>
            <th className="py-2 font-normal">{t("Source · skill")}</th>
            <th className="py-2 text-right font-normal">{t("Raw score")}</th>
            <th className="py-2 text-right font-normal">{t("Percentage")}</th>
            <th className="py-2 font-normal">{t("Marked by")}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sorted.map((r, i) => (
            <tr key={`${r.itemId}-${r.occurredOn}-${i}`} className="border-t">
              <td className="py-2 whitespace-nowrap">{formatDate(r.occurredOn)}</td>
              <td className="py-2">{t(r.title)}</td>
              <td className="text-muted-foreground py-2 text-xs">
                {SOURCES[r.source]?.label ?? r.source}
                {r.skill && ` · ${SKILL_NAMES[r.skill as keyof typeof SKILL_NAMES] ?? r.skill.replaceAll("_", " ")}`}
              </td>
              <td className="py-2 text-right whitespace-nowrap">{t(rawScore(r))}</td>
              <td className="py-2 text-right">{r.band !== null ? <span className="text-muted-foreground text-xs">{t("band, no %")}</span> : `${r.percent}%`}</td>
              <td className="py-2 text-xs">
                {r.assessedBy === "teacher" ? (
                  <Badge variant="secondary" className="font-normal">
                    {t("Teacher{value}", { value: r.assessor ? `: ${r.assessor}` : "" })}
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
export async function Definitions({ group = false }: { group?: boolean }) {
  const t = await getT()
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
          <InfoIcon className="size-4" aria-hidden /> {t("How to read these numbers")}
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
          {t("Only published results count: returned assignment and writing/speaking grades, graded tests (best attempt), reviewed English work and practice results. Work a teacher has not returned is not included.")}
          {group && t(" Group figures are withheld when fewer than {MIN_GROUP} students have results, so no one's scores can be singled out.", { MIN_GROUP })}
        </p>
      </CardContent>
    </Card>
  )
}
