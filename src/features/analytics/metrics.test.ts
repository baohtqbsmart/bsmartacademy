import { describe, expect, it } from "vitest"

import {
  compare,
  groupSkillSummaries,
  groupSummary,
  groupTimeSeries,
  homeworkSummary,
  itemSummaries,
  parseRange,
  previousRange,
  radarSkills,
  skillSummaries,
  summarize,
  timeSeries,
  vocabularySummary,
  type Result,
} from "@/features/analytics/metrics"

let n = 0
const r = (fields: Partial<Result>): Result => ({
  studentId: "s1",
  classId: "c1",
  occurredOn: "2026-09-01",
  source: "assignment",
  skill: null,
  itemId: `i${++n}`,
  title: "Work",
  rawScore: 7,
  maxScore: 10,
  percent: 70,
  band: null,
  assessedBy: "teacher",
  assessor: "Hà",
  ...fields,
})

describe("date ranges", () => {
  it("defaults to the last 90 days and never looks into the future", () => {
    expect(parseRange(undefined, undefined, "2026-09-26")).toEqual({ from: "2026-06-29", to: "2026-09-26", days: 90 })
    expect(parseRange("2026-09-01", "2027-01-01", "2026-09-26").to).toBe("2026-09-26")
    expect(parseRange("2020-01-01", "2026-09-26", "2026-09-26").days).toBe(366)
  })

  it("compares with the same number of days just before", () => {
    const range = parseRange("2026-09-01", "2026-09-30", "2026-12-01")
    expect(previousRange(range)).toEqual({ from: "2026-08-02", to: "2026-08-31", days: 30 })
  })
})

describe("summaries", () => {
  it("average = plain mean of percentages; bands are kept apart", () => {
    const s = summarize([r({ percent: 50 }), r({ percent: 100 }), r({ percent: null, band: 6.5, source: "assessment" }), r({ percent: null, band: 7, source: "assessment" })])
    expect(s).toEqual({ results: 4, scored: 2, averagePercent: 75, lowConfidence: true, bandResults: 2, averageBand: 6.8 })
  })

  it("no results means no average (never zero)", () => {
    expect(summarize([]).averagePercent).toBeNull()
  })

  it("skills with no results stay empty; radar only with three skills", () => {
    const skills = skillSummaries([r({ skill: "reading", percent: 80 }), r({ skill: "writing", percent: 60 })])
    expect(skills.find((s) => s.skill === "listening")!.averagePercent).toBeNull()
    expect(radarSkills(skills)).toBeNull()
    const three = skillSummaries([r({ skill: "reading" }), r({ skill: "writing" }), r({ skill: "grammar", assessedBy: "automatic" })])
    expect(radarSkills(three)!.map((s) => s.skill)).toEqual(["reading", "writing", "grammar"])
    expect(three.find((s) => s.skill === "grammar")).toMatchObject({ teacherAssessed: 0, automatic: 1 })
  })

  it("comparison is in percentage points and flags thin data", () => {
    const now = summarize([r({ percent: 80 }), r({ percent: 90 }), r({ percent: 70 })])
    const before = summarize([r({ percent: 60 })])
    expect(compare(now, before)).toEqual({ current: 80, previous: 60, delta: 20, lowConfidence: true })
    expect(compare(now, summarize([])).delta).toBeNull()
  })
})

describe("over time", () => {
  it("weekly buckets with gaps for empty weeks", () => {
    const range = parseRange("2026-09-01", "2026-09-21", "2026-12-01")
    const series = timeSeries([r({ occurredOn: "2026-09-01", percent: 60 }), r({ occurredOn: "2026-09-03", percent: 80 }), r({ occurredOn: "2026-09-16", percent: 90 })], range)
    expect(series.granularity).toBe("week")
    expect(series.buckets.map((b) => [b.key, b.average, b.results])).toEqual([
      ["2026-08-31", 70, 2],
      ["2026-09-07", null, 0],
      ["2026-09-14", 90, 1],
      ["2026-09-21", null, 0],
    ])
  })

  it("monthly beyond four months; bands never enter the line", () => {
    const range = parseRange("2026-01-01", "2026-06-30", "2026-12-01")
    const series = timeSeries([r({ occurredOn: "2026-03-05", percent: null, band: 6 })], range)
    expect(series.granularity).toBe("month")
    expect(series.buckets).toHaveLength(6)
    expect(series.buckets.every((b) => b.average === null)).toBe(true)
  })
})

describe("groups", () => {
  const cls = [
    r({ studentId: "a", percent: 100 }),
    r({ studentId: "a", percent: 100 }),
    r({ studentId: "a", percent: 100 }),
    r({ studentId: "b", percent: 40 }),
    r({ studentId: "c", percent: 70 }),
  ]

  it("averages students, not results, and shows only counts per range", () => {
    const g = groupSummary(cls)
    expect(g).toEqual({
      suppressed: false,
      studentsWithResults: 3,
      averageOfStudents: 70,
      distribution: [
        { label: "Below 50%", students: 1 },
        { label: "50–69%", students: 0 },
        { label: "70–84%", students: 1 },
        { label: "85–100%", students: 1 },
      ],
    })
  })

  it("withholds groups of fewer than three students", () => {
    expect(groupSummary(cls.filter((x) => x.studentId !== "c"))).toEqual({ suppressed: true, studentsWithResults: 2 })
    expect(groupSkillSummaries(cls).every((s) => s.suppressed)).toBe(true)
    const items = itemSummaries([r({ itemId: "hw", studentId: "a" }), r({ itemId: "hw", studentId: "b" })])
    expect(items[0]).toMatchObject({ students: 2, average: null })
  })

  it("trend buckets need three students", () => {
    const range = parseRange("2026-09-01", "2026-09-07", "2026-12-01")
    const series = groupTimeSeries(cls, range)
    expect(series.buckets[0]).toMatchObject({ average: 70, results: 3 })
    expect(groupTimeSeries(cls.slice(0, 4), range).buckets[0].average).toBeNull()
  })
})

describe("homework and vocabulary", () => {
  it("completion counts only homework already due", () => {
    expect(homeworkSummary([{ set_count: 5, handed_in: 3, late: 1, missing: 1, not_due: 1 }])).toMatchObject({ due: 4, completionRate: 0.75, onTimeRate: 0.5 })
    expect(homeworkSummary([{ set_count: 1, handed_in: 0, late: 0, missing: 0, not_due: 1 }]).completionRate).toBeNull()
  })

  it("secure words are in box 4 or 5", () => {
    expect(vocabularySummary([{ box: 1, words: 2 }, { box: 4, words: 3 }, { box: 5, words: 1 }])).toMatchObject({ total: 6, secure: 4 })
  })
})
