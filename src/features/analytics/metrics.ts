import { addDays, isIsoDate, mondayOf, todayInAcademy } from "@/lib/dates"

/**
 * Progress metrics, kept honest on purpose:
 *
 * - A result keeps its raw score and maximum; its percentage is score ÷ max.
 * - An "average" is the plain mean of result percentages, always shown with
 *   how many results it covers. Averages from fewer than MIN_RESULTS results
 *   are flagged as low confidence.
 * - IELTS-style bands are never turned into percentages or averaged with them.
 * - A period with no results is a gap, never a zero.
 * - Group figures (class, academy) average students first, so one student's
 *   many practice attempts do not outweigh classmates, and are withheld when
 *   fewer than MIN_GROUP students have results.
 * - Levels are the ones recorded by staff; they are never derived from scores.
 */

export const MIN_RESULTS = 3
export const MIN_GROUP = 3
export const DEFAULT_RANGE_DAYS = 90
export const MAX_RANGE_DAYS = 366

export const ENGLISH_SKILLS = ["listening", "reading", "speaking", "writing", "grammar", "vocabulary", "pronunciation"] as const
export type EnglishSkill = (typeof ENGLISH_SKILLS)[number]
export const SKILL_NAMES: Record<EnglishSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  speaking: "Speaking",
  writing: "Writing",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
}

export const SOURCES = {
  assignment: { label: "Assignments", marking: "Marked by a teacher" },
  quiz: { label: "Quizzes", marking: "Marked by a teacher" },
  test: { label: "Tests", marking: "Test engine (open answers marked by a teacher); best attempt" },
  lesson_practice: { label: "English exercises", marking: "Marked automatically; every attempt counts" },
  lesson_review: { label: "English work reviewed", marking: "Teacher assessment" },
  assessment: { label: "Writing & speaking tasks", marking: "Teacher assessment (rubric)" },
  vocabulary_practice: { label: "Vocabulary practice", marking: "Marked automatically; every session counts" },
} as const
export type Source = keyof typeof SOURCES
export const SOURCE_KEYS = Object.keys(SOURCES) as Source[]

export const ASSESSED_BY_LABELS: Record<string, string> = {
  teacher: "Teacher",
  automatic: "Automatic",
  test_engine: "Test engine",
}

export type Result = {
  studentId: string
  classId: string | null
  occurredOn: string
  source: Source
  skill: string | null
  itemId: string
  title: string
  rawScore: number
  maxScore: number
  /** null for IELTS-style bands. */
  percent: number | null
  band: number | null
  assessedBy: string
  assessor: string | null
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type Range = { from: string; to: string; days: number }

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

export function parseRange(from: unknown, to: unknown, today: string = todayInAcademy()): Range {
  const end = isIsoDate(to) && to <= today ? to : today
  let start = isIsoDate(from) && from <= end ? from : addDays(end, 1 - DEFAULT_RANGE_DAYS)
  if (daysBetween(start, end) > MAX_RANGE_DAYS) start = addDays(end, 1 - MAX_RANGE_DAYS)
  return { from: start, to: end, days: daysBetween(start, end) }
}

/** The same number of days immediately before. */
export function previousRange(range: Range): Range {
  const to = addDays(range.from, -1)
  return { from: addDays(to, 1 - range.days), to, days: range.days }
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

const round1 = (v: number) => Math.round(v * 10) / 10
export const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length)

export type Summary = {
  /** Every result, bands included. */
  results: number
  /** Results with a percentage (the average's base). */
  scored: number
  averagePercent: number | null
  lowConfidence: boolean
  bandResults: number
  /** Mean of IELTS-style bands (not itself an official band). */
  averageBand: number | null
}

export function summarize(results: Result[]): Summary {
  const percents = results.flatMap((r) => (r.percent === null ? [] : [r.percent]))
  const bands = results.flatMap((r) => (r.band === null ? [] : [r.band]))
  const avg = mean(percents)
  const band = mean(bands)
  return {
    results: results.length,
    scored: percents.length,
    averagePercent: avg === null ? null : round1(avg),
    lowConfidence: percents.length > 0 && percents.length < MIN_RESULTS,
    bandResults: bands.length,
    averageBand: band === null ? null : round1(band),
  }
}

export type SkillSummary = Summary & { skill: EnglishSkill; latest: Result | null; teacherAssessed: number; automatic: number }

export function skillSummaries(results: Result[]): SkillSummary[] {
  return ENGLISH_SKILLS.map((skill) => {
    const own = results.filter((r) => r.skill === skill).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
    return {
      skill,
      ...summarize(own),
      latest: own.at(-1) ?? null,
      teacherAssessed: own.filter((r) => r.assessedBy === "teacher").length,
      automatic: own.filter((r) => r.assessedBy !== "teacher").length,
    }
  })
}

export function sourceSummaries(results: Result[]) {
  return SOURCE_KEYS.map((source) => {
    const own = results.filter((r) => r.source === source).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
    return { source, ...summarize(own), latest: own.at(-1) ?? null }
  })
}

/** Radar charts need at least three skills with percentages; otherwise bars say more. */
export function radarSkills(skills: SkillSummary[]) {
  const withData = skills.filter((s) => s.averagePercent !== null)
  return withData.length >= 3 ? withData : null
}

export type Comparison = { current: number | null; previous: number | null; delta: number | null; lowConfidence: boolean }

/** Current period vs the previous one, in percentage points. */
export function compare(current: Summary, previous: Summary): Comparison {
  const delta = current.averagePercent !== null && previous.averagePercent !== null ? round1(current.averagePercent - previous.averagePercent) : null
  return {
    current: current.averagePercent,
    previous: previous.averagePercent,
    delta,
    lowConfidence: current.scored < MIN_RESULTS || previous.scored < MIN_RESULTS,
  }
}

// ---------------------------------------------------------------------------
// Over time
// ---------------------------------------------------------------------------

export type Bucket = { key: string; label: string; average: number | null; results: number }

/** Weekly buckets up to ~4 months, monthly beyond. Empty buckets stay null. */
export function timeSeries(results: Result[], range: Range): { granularity: "week" | "month"; buckets: Bucket[] } {
  const granularity = range.days <= 120 ? "week" : "month"
  const keyOf = (date: string) => (granularity === "week" ? mondayOf(date) : date.slice(0, 7))
  const keys: string[] = []
  if (granularity === "week") {
    for (let d = mondayOf(range.from); d <= range.to; d = addDays(d, 7)) keys.push(d)
  } else {
    for (let m = range.from.slice(0, 7); m <= range.to.slice(0, 7); m = nextMonth(m)) keys.push(m)
  }
  const groups = new Map<string, number[]>()
  for (const r of results) {
    if (r.percent === null) continue
    const key = keyOf(r.occurredOn)
    groups.set(key, [...(groups.get(key) ?? []), r.percent])
  }
  return {
    granularity,
    buckets: keys.map((key) => {
      const values = groups.get(key) ?? []
      const avg = mean(values)
      return { key, label: granularity === "week" ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : `${key.slice(5, 7)}/${key.slice(0, 4)}`, average: avg === null ? null : round1(avg), results: values.length }
    }),
  }
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Groups (class, academy): students first, then the group
// ---------------------------------------------------------------------------

export type GroupSummary =
  | { suppressed: true; studentsWithResults: number }
  | {
      suppressed: false
      studentsWithResults: number
      /** Mean of the students' own average percentages. */
      averageOfStudents: number
      /** How many students' averages fall in each band of percentages. */
      distribution: { label: string; students: number }[]
    }

export const DISTRIBUTION = [
  { label: "Below 50%", min: 0, max: 50 },
  { label: "50–69%", min: 50, max: 70 },
  { label: "70–84%", min: 70, max: 85 },
  { label: "85–100%", min: 85, max: 100.0001 },
] as const

export function studentAverages(results: Result[]) {
  const by = new Map<string, number[]>()
  for (const r of results) if (r.percent !== null) by.set(r.studentId, [...(by.get(r.studentId) ?? []), r.percent])
  return new Map([...by].map(([id, values]) => [id, mean(values)!]))
}

export function groupSummary(results: Result[]): GroupSummary {
  const averages = [...studentAverages(results).values()]
  if (averages.length < MIN_GROUP) return { suppressed: true, studentsWithResults: averages.length }
  return {
    suppressed: false,
    studentsWithResults: averages.length,
    averageOfStudents: round1(mean(averages)!),
    distribution: DISTRIBUTION.map((d) => ({ label: d.label, students: averages.filter((a) => a >= d.min && a < d.max).length })),
  }
}

export function groupSkillSummaries(results: Result[]) {
  return ENGLISH_SKILLS.map((skill) => ({ skill, ...groupSummary(results.filter((r) => r.skill === skill)) }))
}

/** Per assignment/test/task: the mean of students' percentages, withheld below MIN_GROUP students. */
export function itemSummaries(results: Result[]) {
  const by = new Map<string, Result[]>()
  for (const r of results) if (r.percent !== null && r.classId) by.set(r.itemId, [...(by.get(r.itemId) ?? []), r])
  return [...by.values()]
    .map((rs) => {
      const students = new Set(rs.map((r) => r.studentId)).size
      return {
        itemId: rs[0].itemId,
        title: rs[0].title,
        source: rs[0].source,
        date: rs.map((r) => r.occurredOn).sort()[0],
        students,
        average: students >= MIN_GROUP ? round1(mean(rs.map((r) => r.percent!))!) : null,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Group trend: each bucket averages students' bucket averages; buckets with fewer than MIN_GROUP students are withheld. */
export function groupTimeSeries(results: Result[], range: Range) {
  const byStudent = new Map<string, Result[]>()
  for (const r of results) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r])
  const perStudent = [...byStudent.values()].map((rs) => timeSeries(rs, range))
  const base = timeSeries([], range)
  return {
    granularity: base.granularity,
    buckets: base.buckets.map((b, i) => {
      const values = perStudent.flatMap((s) => (s.buckets[i].average === null ? [] : [s.buckets[i].average!]))
      return { ...b, results: values.length, average: values.length >= MIN_GROUP ? round1(mean(values)!) : null }
    }),
  }
}

// ---------------------------------------------------------------------------
// Homework and vocabulary
// ---------------------------------------------------------------------------

export type HomeworkRow = { set_count: number; handed_in: number; late: number; missing: number; not_due: number }

export function homeworkSummary(rows: HomeworkRow[]) {
  const sum = (k: keyof HomeworkRow) => rows.reduce((a, r) => a + Number(r[k]), 0)
  const due = sum("set_count") - sum("not_due")
  const handedIn = sum("handed_in")
  const late = sum("late")
  const dueHandedIn = Math.min(handedIn, due)
  return {
    set: sum("set_count"),
    due,
    handedIn,
    late,
    missing: sum("missing"),
    notDue: sum("not_due"),
    /** Of the homework already due: share handed in (on time or late). */
    completionRate: due > 0 ? dueHandedIn / due : null,
    onTimeRate: due > 0 ? Math.max(0, dueHandedIn - late) / due : null,
  }
}

/** Leitner boxes 1–5: 4 and 5 are "secure" (reviewed after a week or more). */
export function vocabularySummary(rows: { box: number; words: number }[]) {
  const total = rows.reduce((a, r) => a + Number(r.words), 0)
  const secure = rows.filter((r) => r.box >= 4).reduce((a, r) => a + Number(r.words), 0)
  return { total, secure, byBox: [1, 2, 3, 4, 5].map((box) => ({ box, words: rows.filter((r) => r.box === box).reduce((a, r) => a + Number(r.words), 0) })) }
}
