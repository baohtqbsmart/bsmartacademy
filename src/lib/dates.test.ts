import { describe, expect, it } from "vitest"

import { addDays, formatTime, isWithin, isoWeekday, parseWeek, todayInAcademy, weekDates } from "@/lib/dates"

describe("dates", () => {
  it("computes ISO weekdays", () => {
    expect(isoWeekday("2026-09-21")).toBe(1) // Monday
    expect(isoWeekday("2026-09-27")).toBe(7) // Sunday
  })

  it("normalises any date to the Monday of its week", () => {
    expect(parseWeek("2026-09-24")).toBe("2026-09-21")
    expect(parseWeek("2026-09-27")).toBe("2026-09-21")
    expect(parseWeek("2026-09-21")).toBe("2026-09-21")
  })

  it("falls back to the current academy week for invalid input", () => {
    // 2026-09-27 20:00 UTC is already Monday 2026-09-28 in Vietnam (UTC+7).
    const now = new Date("2026-09-27T20:00:00Z")
    expect(todayInAcademy(now)).toBe("2026-09-28")
    expect(parseWeek("garbage", now)).toBe("2026-09-28")
    expect(parseWeek("2026-13-45", now)).toBe("2026-09-28")
    expect(parseWeek(undefined, now)).toBe("2026-09-28")
  })

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04")
    expect(weekDates("2026-12-28").map((d) => d.date)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ])
  })

  it("checks open-ended ranges", () => {
    expect(isWithin("2026-09-21", "2026-09-07", "2027-05-28")).toBe(true)
    expect(isWithin("2026-09-06", "2026-09-07", null)).toBe(false)
    expect(isWithin("2030-01-01", null, null)).toBe(true)
  })

  it("formats times", () => {
    expect(formatTime("18:00:00")).toBe("18:00")
  })
})
