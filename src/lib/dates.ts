/**
 * Calendar helpers for the timetable. Dates are plain ISO strings
 * ("2026-09-21"); "today" is taken in the academy's time zone so the current
 * week is right regardless of where the server runs.
 */
export const ACADEMY_TIME_ZONE = "Asia/Ho_Chi_Minh"

export const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** A real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const date = toDate(value)
  // Rejects "2026-02-30" whether the engine rolls it over or marks it invalid.
  return !Number.isNaN(date.getTime()) && toIso(date) === value
}

export function todayInAcademy(now: Date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ACADEMY_TIME_ZONE }).format(now)
}

export function addDays(iso: string, days: number) {
  const date = toDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIso(date)
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(iso: string) {
  return toDate(iso).getUTCDay() || 7
}

export function mondayOf(iso: string) {
  return addDays(iso, 1 - isoWeekday(iso))
}

/** Monday of the requested week (any date in it), or of the current week. */
export function parseWeek(value: unknown, now: Date = new Date()) {
  if (isIsoDate(value)) return mondayOf(value)
  return mondayOf(todayInAcademy(now))
}

export function weekDates(monday: string) {
  return WEEKDAYS.map((day) => ({ ...day, date: addDays(monday, day.value - 1) }))
}

/** True if `date` falls inside [start, end]; open ends are unbounded. */
export function isWithin(date: string, start: string | null, end: string | null) {
  return (!start || start <= date) && (!end || date <= end)
}

// Date-time inputs (<input type="datetime-local">) are read in the academy's
// time zone. Vietnam has no daylight saving, so the offset is always +07:00.
const ACADEMY_OFFSET = "+07:00"
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** "2026-09-30T18:00" (academy time) -> ISO instant, or null when invalid. */
export function academyInputToIso(value: string): string | null {
  if (!LOCAL_DATE_TIME.test(value) || !isIsoDate(value.slice(0, 10))) return null
  const date = new Date(`${value}:00${ACADEMY_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** ISO instant -> "2026-09-30T18:00" in academy time, for datetime-local inputs. */
export function isoToAcademyInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 16)
}

/** "18:00:00" -> "18:00". */
export function formatTime(value: string) {
  return value.slice(0, 5)
}
