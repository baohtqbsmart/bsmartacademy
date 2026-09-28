import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { summarizeStreak } = await import("@/features/progress/server/progress-service")

describe("summarizeStreak", () => {
  const today = "2026-09-28"

  it("counts back from today", () => {
    expect(summarizeStreak(new Set(["2026-09-26", "2026-09-27", "2026-09-28"]), today)).toMatchObject({ current: 3, best: 3, activeToday: true })
  })

  it("keeps yesterday's streak alive until today ends", () => {
    expect(summarizeStreak(new Set(["2026-09-26", "2026-09-27"]), today)).toMatchObject({ current: 2, activeToday: false })
  })

  it("a gap breaks the streak but the best run is remembered", () => {
    const days = new Set(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-28"])
    expect(summarizeStreak(days, today)).toMatchObject({ current: 1, best: 4 })
  })

  it("shows the last 14 days, oldest first", () => {
    const { recent } = summarizeStreak(new Set(["2026-09-15", "2026-09-28"]), today)
    expect(recent).toHaveLength(14)
    expect(recent[0]).toEqual({ day: "2026-09-15", active: true })
    expect(recent[13]).toEqual({ day: "2026-09-28", active: true })
  })

  it("no activity means no streak", () => {
    expect(summarizeStreak(new Set(), today)).toMatchObject({
      current: 0,
      best: 0,
    })
  })
})
