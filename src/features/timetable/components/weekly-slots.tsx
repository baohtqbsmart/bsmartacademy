import { formatTime, WEEKDAYS } from "@/lib/dates"
import { getT } from "@/i18n/server"

export type WeeklySlot = {
  id: string
  weekday: number
  starts_at: string
  ends_at: string
  room: string | null
  label?: string
}

export function sortSlots<T extends { weekday: number; starts_at: string }>(slots: T[]) {
  return [...slots].sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at))
}

/** Compact recurring pattern: "Mon 17:30–19:00 · P202". */
export async function WeeklySlots({ slots, empty = "No timetable yet." }: { slots: WeeklySlot[]; empty?: string }) {
  const t = await getT()
  if (slots.length === 0) return <p className="text-muted-foreground text-sm">{t(empty)}</p>
  return (
    <ul className="grid gap-1.5 text-sm">
      {sortSlots(slots).map((slot) => (
        <li key={slot.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="w-10 font-medium">{t(WEEKDAYS[slot.weekday - 1].short)}</span>
          <span className="tabular-nums">
            {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
          </span>
          {slot.label && <span>{slot.label}</span>}
          {slot.room && <span className="text-muted-foreground">· {slot.room}</span>}
        </li>
      ))}
    </ul>
  )
}
