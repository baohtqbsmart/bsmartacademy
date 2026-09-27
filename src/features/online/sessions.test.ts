import { describe, expect, it } from "vitest"

import { academyDate, academyTime, isUpcoming, joinState, monthGrid, parseMonth, shiftMonth } from "@/features/online/sessions"
import { detectProvider, isValidMeetingUrl } from "@/lib/meetings"

const session = (start: string, end: string, status: "scheduled" | "live" | "ended" | "cancelled" = "scheduled") => ({
  starts_at: start,
  ends_at: end,
  status,
})

describe("join window", () => {
  const s = session("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z")
  it.each([
    ["2026-10-01T10:40:00Z", "not_yet"],
    ["2026-10-01T10:46:00Z", "open"],
    ["2026-10-01T11:30:00Z", "open"],
    ["2026-10-01T12:01:00Z", "finished"],
  ] as const)("at %s -> %s", (now, state) => {
    expect(joinState(s, new Date(now))).toBe(state)
  })

  it("a live session stays open; a cancelled one never opens", () => {
    expect(joinState({ ...s, status: "live" }, new Date("2026-10-01T13:00:00Z"))).toBe("open")
    expect(joinState({ ...s, status: "cancelled" }, new Date("2026-10-01T11:10:00Z"))).toBe("cancelled")
    expect(isUpcoming(s, new Date("2026-10-01T11:59:00Z"))).toBe(true)
    expect(isUpcoming(s, new Date("2026-10-01T12:01:00Z"))).toBe(false)
  })

  it("reads instants in Vietnam time", () => {
    expect(academyDate("2026-10-01T17:30:00Z")).toBe("2026-10-02")
    expect(academyTime("2026-10-01T11:00:00Z")).toBe("18:00")
  })
})

describe("month calendar", () => {
  it("covers the month in full Monday-first weeks", () => {
    const weeks = monthGrid("2026-10")
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0][0].date).toBe("2026-09-28")
    expect(weeks[0][3]).toEqual({ date: "2026-10-01", inMonth: true })
    expect(weeks.at(-1)!.at(-1)!.date).toBe("2026-11-01")
    expect(weeks).toHaveLength(5)
  })

  it("parses and moves between months", () => {
    expect(parseMonth("2026-13", "2026-09-25")).toBe("2026-09")
    expect(parseMonth("2026-02")).toBe("2026-02")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
  })
})

describe("meeting links", () => {
  it("recognises the provider of a pasted link", () => {
    expect(detectProvider(" https://meet.google.com/abc-defg-hij ")).toBe("google_meet")
    expect(detectProvider("https://us02web.zoom.us/j/81234567890?pwd=x")).toBe("zoom")
    expect(detectProvider("https://teams.microsoft.com/l/meetup-join/abc")).toBe("microsoft_teams")
    expect(detectProvider("https://jitsi.example.test/room")).toBe("other")
    expect(detectProvider("not a link")).toBeNull()
    expect(isValidMeetingUrl("zoom", "https://zoom.us.evil.test/j/1")).toBe(false)
  })
})
