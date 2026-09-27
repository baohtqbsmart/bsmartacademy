import { can, type Permission, type PermissionGrants, type PermissionScope } from "@/lib/auth/permissions"

/**
 * The reports, who may run them and which filters apply. The database (RLS)
 * narrows every report to the caller's data; `requires` additionally keeps
 * academy-wide financial and staff reports away from teachers.
 */
export const FILTERS = ["from", "to", "class", "teacher", "course", "level", "student"] as const
export type FilterKey = (typeof FILTERS)[number]

type ReportDef = {
  title: string
  description: string
  filters: readonly FilterKey[]
  requires: { permission: Permission; scopes?: readonly PermissionScope[] }
  /** What the report deliberately leaves out. */
  privacy?: string
}

const ALL: readonly FilterKey[] = FILTERS

export const REPORTS = {
  students: {
    title: "Student report",
    description: "Each student's classes, attendance, homework and average result.",
    filters: ALL,
    requires: { permission: "reports.read" },
    privacy: "No contact details, addresses or dates of birth.",
  },
  classes: {
    title: "Class report",
    description: "Each class's size, sessions, attendance, homework and results.",
    filters: ["from", "to", "class", "teacher", "course", "level"],
    requires: { permission: "reports.read" },
    privacy: "Class averages are withheld when fewer than 3 students have results.",
  },
  teachers: {
    title: "Teacher report",
    description: "Classes, students, registers, assignments set and marking backlog per teacher.",
    filters: ["from", "to", "class", "teacher", "course", "level"],
    requires: { permission: "reports.read", scopes: ["all"] },
    privacy: "Administrators only. No contact details or pay information.",
  },
  attendance: {
    title: "Attendance report",
    description: "Present, late, absent and excused per student, with the weekly trend.",
    filters: ALL,
    requires: { permission: "reports.read" },
  },
  assignments: {
    title: "Assignment report",
    description: "Hand-in, lateness, marking and returned results per assignment.",
    filters: ["from", "to", "class", "teacher", "course", "level"],
    requires: { permission: "reports.read" },
    privacy: "Averages use returned grades only.",
  },
  tests: {
    title: "Test report",
    description: "Attempts, marking and score range per test (best attempt per student).",
    filters: ["from", "to", "class", "teacher", "course", "level"],
    requires: { permission: "reports.read" },
  },
  tuition: {
    title: "Tuition report",
    description: "Invoices issued in the period with amounts paid and outstanding, and payments by month.",
    filters: ALL,
    requires: { permission: "tuition.read", scopes: ["all"] },
    privacy: "Finance staff and administrators only.",
  },
  progress: {
    title: "Academic progress report",
    description: "Each student's average in the period compared with the previous period of the same length.",
    filters: ALL,
    requires: { permission: "reports.read" },
    privacy: "Published results only (returned grades, graded tests, reviewed work, practice).",
  },
} as const satisfies Record<string, ReportDef>

export type ReportKey = keyof typeof REPORTS
export const REPORT_KEYS = Object.keys(REPORTS) as ReportKey[]

export function isReportKey(value: unknown): value is ReportKey {
  return typeof value === "string" && value in REPORTS
}

/** What a report deliberately leaves out, if anything. */
export function reportPrivacy(key: ReportKey): string | null {
  return (REPORTS[key] as ReportDef).privacy ?? null
}

export function canRunReport(grants: PermissionGrants, key: ReportKey) {
  const { permission, scopes } = REPORTS[key].requires as ReportDef["requires"]
  return can(grants, permission, scopes)
}

// ---------------------------------------------------------------------------
// Tables and CSV
// ---------------------------------------------------------------------------

export type ColumnKind = "text" | "number" | "percent" | "money" | "date"
export type Column = { key: string; label: string; kind: ColumnKind }
export type Cell = string | number | null
export type Row = Record<string, Cell>

/** Spreadsheet-safe CSV: quoted where needed, formulas neutralised, UTF-8 BOM for Excel. */
/** `translate` renders headers and status values in the reader's language. */
export function toCsv(columns: Column[], rows: Row[], translate: (text: string) => string = (text) => text) {
  const escape = (value: Cell) => {
    if (value === null || value === undefined) return ""
    let text = String(value)
    // A leading = + - @ (or tab/CR) would be run as a formula by spreadsheet programs.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const cell = (c: Column, value: Cell) => (c.key === "status" && typeof value === "string" ? translate(value.replaceAll("_", " ")) : value)
  const lines = [columns.map((c) => escape(translate(c.label))).join(","), ...rows.map((r) => columns.map((c) => escape(cell(c, r[c.key]))).join(","))]
  return "﻿" + lines.join("\r\n") + "\r\n"
}

export function csvFileName(key: ReportKey, from: string, to: string) {
  return `bsmart-${key}-report-${from}-to-${to}.csv`
}
