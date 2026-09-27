import { addDays, isIsoDate, mondayOf, todayInAcademy } from "@/lib/dates"
import type { Enums } from "@/types/database"

export type AttendanceStatus = Enums<"attendance_status">

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const satisfies readonly AttendanceStatus[]

export type StatusCounts = Record<AttendanceStatus, number>

export const emptyCounts = (): StatusCounts => ({ present: 0, late: 0, absent: 0, excused: 0 })

export function addCounts(a: StatusCounts, b: Partial<StatusCounts>): StatusCounts {
  return {
    present: a.present + Number(b.present ?? 0),
    late: a.late + Number(b.late ?? 0),
    absent: a.absent + Number(b.absent ?? 0),
    excused: a.excused + Number(b.excused ?? 0),
  }
}

/**
 * Share of sessions attended: (present + late) / (present + late + absent).
 * Excused sessions are left out, so an approved absence does not lower the
 * rate. null when nothing counts yet.
 */
export function attendanceRate(counts: StatusCounts): number | null {
  const counted = counts.present + counts.late + counts.absent
  return counted === 0 ? null : (counts.present + counts.late) / counted
}

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

/**
 * Repeated-absence warnings. Consecutive = the current run of absences in a
 * class (excused sessions neither count nor break it); recent = absences in
 * the last ABSENCE_WINDOW_DAYS days.
 */
export const ABSENCE_WINDOW_DAYS = 30
export const ABSENCE_RULES = {
  serious: { consecutive: 3, recent: 5 },
  warning: { consecutive: 2, recent: 3 },
} as const

export type AlertLevel = keyof typeof ABSENCE_RULES

export function absenceAlertLevel({ consecutive, recent }: { consecutive: number; recent: number }): AlertLevel | null {
  for (const level of ["serious", "warning"] as const) {
    const rule = ABSENCE_RULES[level]
    if (consecutive >= rule.consecutive || recent >= rule.recent) return level
  }
  return null
}

export function describeAlert({ consecutive, recent }: { consecutive: number; recent: number }) {
  const parts = []
  if (consecutive >= 2) parts.push(`${consecutive} absences in a row`)
  if (recent > 0 && !(consecutive >= 2 && recent === consecutive)) {
    parts.push(`${recent} absence${recent === 1 ? "" : "s"} in ${ABSENCE_WINDOW_DAYS} days`)
  }
  return parts.join(" · ")
}

// ---------------------------------------------------------------------------
// Date range (URL ?from=&to=)
// ---------------------------------------------------------------------------

export const DEFAULT_RANGE_DAYS = 30
const MAX_RANGE_DAYS = 366

/** A valid range from the query string, or the last 30 days up to today. */
export function parseDateRange(from: unknown, to: unknown, today: string = todayInAcademy()) {
  const end = isIsoDate(to) ? to : today
  const start = isIsoDate(from) && from <= end ? from : addDays(end, 1 - DEFAULT_RANGE_DAYS)
  // Keep reports bounded: at most a year.
  const clampedStart = start < addDays(end, 1 - MAX_RANGE_DAYS) ? addDays(end, 1 - MAX_RANGE_DAYS) : start
  return { from: clampedStart, to: end, isDefault: !isIsoDate(from) && !isIsoDate(to) }
}

// ---------------------------------------------------------------------------
// Weekly trend
// ---------------------------------------------------------------------------

type WeekRow = { week_start: string } & Partial<StatusCounts>

/** One entry per week (Monday) in the range, gaps filled with zeros. */
export function weeklySeries(rows: WeekRow[], from: string, to: string) {
  const byWeek = new Map(rows.map((row) => [row.week_start, addCounts(emptyCounts(), row)]))
  const series = []
  for (let week = mondayOf(from); week <= to; week = addDays(week, 7)) {
    const counts = byWeek.get(week) ?? emptyCounts()
    const rate = attendanceRate(counts)
    series.push({
      week,
      label: `${week.slice(8, 10)}/${week.slice(5, 7)}`,
      ...counts,
      total: counts.present + counts.late + counts.absent + counts.excused,
      // Percent for the chart; weeks without sessions have no bar.
      rate: rate === null ? null : Math.round(rate * 1000) / 10,
    })
  }
  return series
}
