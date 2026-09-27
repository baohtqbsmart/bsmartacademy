import { describe, expect, it } from "vitest"

import { availableActions, effectiveStatus, formatScore, restoreTarget, workStatus } from "@/features/assignments/status"
import { academyInputToIso, isoToAcademyInput } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"

const now = new Date("2026-09-25T03:00:00Z") // 10:00 in Vietnam

describe("effectiveStatus", () => {
  it("treats a scheduled assignment as published once its time has come", () => {
    expect(effectiveStatus("scheduled", "2026-09-25T02:00:00Z", now)).toBe("published")
    expect(effectiveStatus("scheduled", "2026-09-26T02:00:00Z", now)).toBe("scheduled")
    expect(effectiveStatus("draft", null, now)).toBe("draft")
  })

  it("offers only the moves the database allows", () => {
    expect(availableActions("draft")).toEqual(["publish", "schedule", "archive"])
    expect(availableActions("published")).toEqual(["close", "archive"])
    expect(availableActions("closed")).toEqual(["reopen", "archive"])
    expect(availableActions("archived")).toEqual(["restore"])
    expect(restoreTarget("2026-09-01T00:00:00Z")).toBe("closed")
    expect(restoreTarget(null)).toBe("draft")
  })
})

describe("workStatus", () => {
  const due = "2026-09-24T10:00:00Z"
  it.each([
    [null, due, "staff", "missing"],
    [null, "2026-09-30T10:00:00Z", "family", "not_started"],
    [null, null, "family", "not_started"],
    [{ status: "in_progress", is_late: false }, due, "family", "in_progress"],
    [{ status: "submitted", is_late: false }, due, "family", "submitted"],
    [{ status: "submitted", is_late: true }, due, "staff", "late"],
    [{ status: "graded", is_late: false }, due, "staff", "graded"],
    // Students and parents do not learn a grade exists before it is returned.
    [{ status: "graded", is_late: false }, due, "family", "submitted"],
    [{ status: "graded", is_late: true }, due, "family", "late"],
    [{ status: "returned", is_late: true }, due, "family", "returned"],
  ] as const)("%o due %s (%s) -> %s", (latest, dueAt, viewer, expected) => {
    expect(workStatus(latest, dueAt, viewer, now)).toBe(expected)
  })

  it("formats scores without trailing zeros", () => {
    expect(formatScore("9.50", "10.00")).toBe("9.5 / 10")
  })
})

describe("academy date-times", () => {
  it("reads datetime-local input as Vietnam time and back", () => {
    expect(academyInputToIso("2026-09-30T18:00")).toBe("2026-09-30T11:00:00.000Z")
    expect(isoToAcademyInput("2026-09-30T11:00:00.000Z")).toBe("2026-09-30T18:00")
    expect(academyInputToIso("2026-02-30T18:00")).toBeNull()
    expect(academyInputToIso("30/09/2026 18:00")).toBeNull()
    expect(formatDateTime("2026-09-30T11:00:00Z")).toBe("30/09/2026 18:00")
  })
})
