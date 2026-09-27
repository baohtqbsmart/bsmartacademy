import { z } from "zod"

import { parseRange } from "@/features/analytics/metrics"
import { REPORTS, type ReportKey } from "@/features/reports/catalog"
import { todayInAcademy } from "@/lib/dates"

type Params = Record<string, string | string[] | undefined> | URLSearchParams

const first = (params: Params, key: string) => {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key]
  return Array.isArray(v) ? v[0] : (v ?? undefined)
}
const uuid = (v: string | undefined) => (v && z.uuid().safeParse(v).success ? v : undefined)

/** Filters for a report from URL parameters; filters the report does not use are ignored. */
export function parseReportFilters(key: ReportKey, params: Params, today: string = todayInAcademy()) {
  const allowed = new Set<string>(REPORTS[key].filters)
  const range = parseRange(first(params, "from"), first(params, "to"), today)
  const pick = (name: string) => (allowed.has(name) ? uuid(first(params, name)) : undefined)
  return {
    ...range,
    classId: pick("class"),
    teacherId: pick("teacher"),
    courseId: pick("course"),
    levelId: pick("level"),
    studentId: pick("student"),
  }
}

export type ParsedFilters = ReturnType<typeof parseReportFilters>

/** Back to URL parameters (for the CSV link and the filter form). */
export function filterParams(f: ParsedFilters) {
  const entries: [string, string | undefined][] = [
    ["from", f.from],
    ["to", f.to],
    ["class", f.classId],
    ["teacher", f.teacherId],
    ["course", f.courseId],
    ["level", f.levelId],
    ["student", f.studentId],
  ]
  return new URLSearchParams(entries.filter((e): e is [string, string] => Boolean(e[1])))
}
