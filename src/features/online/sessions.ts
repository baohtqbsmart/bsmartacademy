import { addDays, isoToAcademyInput, mondayOf, todayInAcademy } from "@/lib/dates"
import type { Enums } from "@/types/database"

export type SessionStatus = Enums<"online_session_status">

export const STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  live: "Live now",
  ended: "Ended",
  cancelled: "Cancelled",
}

/** Students may open the meeting from this many minutes before the start (same as join_online_session()). */
export const JOIN_EARLY_MINUTES = 15

type Timed = { starts_at: string; ends_at: string; status: SessionStatus }

export type JoinState = "not_yet" | "open" | "finished" | "cancelled"

export function joinState(session: Timed, now: Date = new Date()): JoinState {
  if (session.status === "cancelled") return "cancelled"
  if (session.status === "live") return "open"
  const opens = new Date(session.starts_at).getTime() - JOIN_EARLY_MINUTES * 60_000
  if (now.getTime() < opens) return "not_yet"
  if (now.getTime() > new Date(session.ends_at).getTime()) return "finished"
  return "open"
}

/** Upcoming until it ends (or while live); past afterwards. Cancelled sessions follow their time. */
export function isUpcoming(session: Timed, now: Date = new Date()) {
  return session.status === "live" || new Date(session.ends_at).getTime() >= now.getTime()
}

/** Academy-time parts of an instant: "2026-09-30", "18:00". */
export function academyDate(iso: string) {
  return isoToAcademyInput(iso).slice(0, 10)
}
export function academyTime(iso: string) {
  return isoToAcademyInput(iso).slice(11, 16)
}

// ---------------------------------------------------------------------------
// Month calendar
// ---------------------------------------------------------------------------

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function parseMonth(value: unknown, today: string = todayInAcademy()) {
  return typeof value === "string" && MONTH.test(value) ? value : today.slice(0, 7)
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)))
}

/** Weeks (Monday first) covering the month; days outside it are flagged. */
export function monthGrid(month: string) {
  const first = `${month}-01`
  const start = mondayOf(first)
  const nextMonth = `${shiftMonth(month, 1)}-01`
  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let day = start; day < nextMonth || weeks.length === 0 || weeks[weeks.length - 1].length < 7; ) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) {
      if (day >= nextMonth) break
      weeks.push([])
    }
    weeks[weeks.length - 1].push({ date: day, inMonth: day.slice(0, 7) === month })
    day = addDays(day, 1)
  }
  return weeks
}
