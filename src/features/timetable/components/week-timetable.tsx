import { MapPinIcon, VideoIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { classPath } from "@/config/routes"
import type { TimetableEntry } from "@/features/timetable/server/timetable-service"
import { formatTime, isWithin, weekDates } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

type WeekTimetableProps = {
  monday: string
  today: string
  entries: TimetableEntry[]
  /** Parents: class id -> names of their children in that class. */
  childrenByClass?: Record<string, string[]>
}

/**
 * One calendar week. A class appears on a day only if that date falls inside
 * the class's start/end dates, so the grid reflects the real calendar.
 */
export function WeekTimetable({ monday, today, entries, childrenByClass }: WeekTimetableProps) {
  const days = weekDates(monday).map((day) => ({
    ...day,
    entries: entries.filter((e) => e.weekday === day.value && isWithin(day.date, e.start_date, e.end_date)),
  }))

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((day) => (
        <section
          key={day.date}
          aria-label={`${day.label} ${formatDate(day.date)}`}
          className={cn("bg-card grid content-start gap-2 rounded-lg border p-2", day.date === today && "border-primary")}
        >
          <header className="flex items-baseline justify-between px-1">
            <span className="text-sm font-semibold">{day.short}</span>
            <span className="text-muted-foreground text-xs">{formatDate(day.date).slice(0, 5)}</span>
          </header>
          {day.entries.length === 0 ? (
            <p className="text-muted-foreground px-1 text-xs">No classes</p>
          ) : (
            day.entries.map((entry) => (
              <article key={entry.slot_id} className="bg-muted/60 grid gap-1 rounded-md p-2 text-xs">
                <span className="font-semibold tabular-nums">
                  {formatTime(entry.starts_at)}–{formatTime(entry.ends_at)}
                </span>
                <Link href={classPath(entry.class_id)} className="text-sm leading-tight font-medium hover:underline">
                  {entry.class_name}
                </Link>
                <span className="text-muted-foreground">{entry.subject_name ?? entry.course_name}</span>
                {entry.lead_teacher_name && <span>{entry.lead_teacher_name}</span>}
                {entry.delivery_mode !== "in_person" && entry.meeting_url ? (
                  <a href={entry.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                    <VideoIcon className="size-3" aria-hidden /> Join online
                  </a>
                ) : null}
                {entry.delivery_mode !== "online" && entry.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="size-3" aria-hidden /> {entry.room}
                  </span>
                )}
                {childrenByClass?.[entry.class_id]?.map((child) => (
                  <Badge key={child} variant="secondary" className="w-fit">
                    {child}
                  </Badge>
                ))}
              </article>
            ))
          )}
        </section>
      ))}
    </div>
  )
}
