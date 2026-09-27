import { describe, expect, it } from "vitest"

import {
  absenceAlertLevel,
  attendanceRate,
  describeAlert,
  formatRate,
  parseDateRange,
  weeklySeries,
} from "@/features/attendance/summary"
import { isIsoDate } from "@/lib/dates"

describe("attendanceRate", () => {
  it("counts late as attended and leaves excused out", () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 2, excused: 5 })).toBe(0.8)
  })

  it("is null when nothing counts (no sessions, or only excused)", () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull()
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 3 })).toBeNull()
  })

  it("formats as a whole percentage", () => {
    expect(formatRate(2 / 3)).toBe("67%")
    expect(formatRate(null)).toBe("—")
  })
})

describe("absenceAlertLevel", () => {
  it.each([
    [{ consecutive: 0, recent: 0 }, null],
    [{ consecutive: 1, recent: 1 }, null],
    [{ consecutive: 1, recent: 2 }, null],
    [{ consecutive: 2, recent: 2 }, "warning"],
    [{ consecutive: 0, recent: 3 }, "warning"],
    [{ consecutive: 3, recent: 3 }, "serious"],
    [{ consecutive: 0, recent: 5 }, "serious"],
  ] as const)("%o -> %s", (input, expected) => {
    expect(absenceAlertLevel(input)).toBe(expected)
  })

  it("describes the pattern without repeating the same absences", () => {
    expect(describeAlert({ consecutive: 3, recent: 3 })).toBe("3 absences in a row")
    expect(describeAlert({ consecutive: 2, recent: 4 })).toBe("2 absences in a row · 4 absences in 30 days")
    expect(describeAlert({ consecutive: 0, recent: 3 })).toBe("3 absences in 30 days")
  })
})

describe("parseDateRange", () => {
  const today = "2026-09-24"

  it("defaults to the last 30 days", () => {
    expect(parseDateRange(undefined, undefined, today)).toEqual({ from: "2026-08-26", to: today, isDefault: true })
  })

  it("accepts a valid range and ignores invalid or reversed dates", () => {
    expect(parseDateRange("2026-09-01", "2026-09-10", today)).toMatchObject({ from: "2026-09-01", to: "2026-09-10" })
    expect(parseDateRange("2026-02-30", "2026-09-10", today)).toMatchObject({ from: "2026-08-12", to: "2026-09-10" })
    expect(parseDateRange("2026-09-20", "2026-09-10", today)).toMatchObject({ from: "2026-08-12", to: "2026-09-10" })
  })

  it("limits a range to one year", () => {
    expect(parseDateRange("2020-01-01", "2026-09-24", today).from).toBe("2025-09-24")
  })
})

describe("isIsoDate", () => {
  it.each([
    ["2026-09-24", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-13-01", false],
    ["24/09/2026", false],
    [undefined, false],
  ])("%s -> %s", (value, expected) => {
    expect(isIsoDate(value)).toBe(expected)
  })
})

describe("weeklySeries", () => {
  it("has one Monday-based week per week of the range, with gaps filled", () => {
    const series = weeklySeries(
      [
        { week_start: "2026-09-07", present: 8, late: 1, absent: 1, excused: 0 },
        { week_start: "2026-09-21", present: 3, late: 0, absent: 0, excused: 2 },
      ],
      "2026-09-09",
      "2026-09-24"
    )
    expect(series.map((w) => w.week)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"])
    expect(series.map((w) => w.rate)).toEqual([90, null, 100])
    expect(series.map((w) => w.total)).toEqual([10, 0, 5])
    expect(series[0].label).toBe("07/09")
  })
})
