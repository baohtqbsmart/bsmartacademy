import { describe, expect, it } from "vitest"

import { canRunReport, csvFileName, REPORT_KEYS, toCsv } from "@/features/reports/catalog"
import { filterParams, parseReportFilters } from "@/features/reports/filters"
import type { PermissionGrants } from "@/lib/auth/permissions"

describe("CSV export", () => {
  it("quotes commas, quotes and line breaks, with a UTF-8 BOM for Excel", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Học sinh", kind: "text" },
        { key: "note", label: "Note", kind: "text" },
        { key: "n", label: "N", kind: "number" },
      ],
      [{ name: "Nguyễn, Gia Huy", note: 'He said "hi"\nbye', n: 3 }]
    )
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.slice(1)).toBe('Học sinh,Note,N\r\n"Nguyễn, Gia Huy","He said ""hi""\nbye",3\r\n')
  })

  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    const csv = toCsv(
      [
        { key: "a", label: "A", kind: "text" },
        { key: "b", label: "B", kind: "number" },
      ],
      [
        { a: "=HYPERLINK(\"http://evil.test\")", b: -2.5 },
        { a: "+1", b: null },
        { a: "@SUM(A1)", b: 0 },
      ]
    )
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"")",-2.5`)
    expect(csv).toContain("'+1,\r\n")
    expect(csv).toContain("'@SUM(A1),0")
  })

  it("names files after the report and period", () => {
    expect(csvFileName("tuition", "2026-07-01", "2026-09-30")).toBe("bsmart-tuition-report-2026-07-01-to-2026-09-30.csv")
  })
})

describe("who may run which report", () => {
  const admin: PermissionGrants = { "reports.read": ["all"], "tuition.read": ["all"] }
  const teacher: PermissionGrants = { "reports.read": ["assigned"] }
  const parent: PermissionGrants = { "tuition.read": ["children"] }
  const financeTeacher: PermissionGrants = { "reports.read": ["assigned"], "tuition.read": ["all"] }

  it("administrators run every report", () => {
    expect(REPORT_KEYS.filter((k) => canRunReport(admin, k))).toEqual(REPORT_KEYS)
  })

  it("teachers never get the tuition or teacher reports", () => {
    expect(REPORT_KEYS.filter((k) => canRunReport(teacher, k))).toEqual(["students", "classes", "attendance", "assignments", "tests", "progress"])
  })

  it("a teacher granted finance rights gets the tuition report, not the staff report", () => {
    expect(canRunReport(financeTeacher, "tuition")).toBe(true)
    expect(canRunReport(financeTeacher, "teachers")).toBe(false)
  })

  it("parents run no report, even with their own tuition rights", () => {
    expect(REPORT_KEYS.filter((k) => canRunReport(parent, k))).toEqual([])
  })
})

describe("filters", () => {
  const id = "00000000-0000-4000-8000-000000000001"
  it("keeps only the filters a report uses, and only valid ids", () => {
    const f = parseReportFilters("classes", { from: "2026-07-01", to: "2026-09-30", class: id, student: id, teacher: "x' or 1=1" }, "2026-10-01")
    expect(f).toMatchObject({ from: "2026-07-01", to: "2026-09-30", classId: id, studentId: undefined, teacherId: undefined })
    expect(filterParams(f).toString()).toBe(`from=2026-07-01&to=2026-09-30&class=${id}`)
  })

  it("defaults to the last 90 days", () => {
    expect(parseReportFilters("students", {}, "2026-09-26")).toMatchObject({ from: "2026-06-29", to: "2026-09-26" })
  })
})
