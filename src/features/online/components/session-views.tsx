import { BanIcon, CalendarClockIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, CircleDotIcon, FileTextIcon, NotebookPenIcon, VideoIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { onlineSessionPath, routes } from "@/config/routes"
import { JoinButton } from "@/features/online/components/session-controls"
import type { SessionListItem } from "@/features/online/server/session-service"
import { academyDate, academyTime, monthGrid, monthLabel, shiftMonth, STATUS_LABELS, type SessionStatus } from "@/features/online/sessions"
import { WEEKDAYS } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { PROVIDERS } from "@/lib/meetings"
import { cn } from "@/lib/utils"
import { getT } from "@/i18n/server"

const STATUS_STYLE: Record<SessionStatus, { icon: typeof VideoIcon; className: string }> = {
  scheduled: { icon: CalendarClockIcon, className: "" },
  live: { icon: CircleDotIcon, className: "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  ended: { icon: CheckCircle2Icon, className: "text-muted-foreground" },
  cancelled: { icon: BanIcon, className: "border-destructive/40 text-destructive" },
}

export async function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = await getT()
  const { icon: Icon, className } = STATUS_STYLE[status]
  return (
    <Badge variant="outline" className={className}>
      <Icon aria-hidden /> {t(STATUS_LABELS[status])}
    </Badge>
  )
}

export function sessionWhen(s: { starts_at: string; ends_at: string }) {
  return `${formatDate(academyDate(s.starts_at))} · ${academyTime(s.starts_at)}–${academyTime(s.ends_at)}`
}

export async function SessionList({ sessions, student, empty }: { sessions: SessionListItem[]; student: boolean; empty: React.ReactNode }) {
  const t = await getT()
  if (sessions.length === 0) return empty
  return (
    <ul className="grid gap-2">
      {sessions.map((s) => (
        <li key={s.id}>
          <Card className="gap-0 py-3">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
              <div className="grid min-w-0 gap-1">
                <Link href={onlineSessionPath(s.id)} className="font-medium hover:underline">
                  {s.title}
                </Link>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {sessionWhen(s)} · {s.class?.name} · {s.teacher?.full_name}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <SessionStatusBadge status={s.status} />
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <VideoIcon className="size-3.5" aria-hidden /> {t(PROVIDERS[s.provider].label)}
                    {!s.meeting_url && t(" · no link yet")}
                  </span>
                  {s.materialCount > 0 && (
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <FileTextIcon className="size-3.5" aria-hidden /> {t("{materialCount} material{value}", { materialCount: s.materialCount, value: s.materialCount === 1 ? "" : "s" })}
                    </span>
                  )}
                  {s.homeworkCount > 0 && (
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <NotebookPenIcon className="size-3.5" aria-hidden /> {t("homework")}
                    </span>
                  )}
                </span>
                {s.status === "cancelled" && s.cancelled_reason && <span className="text-destructive text-sm">{s.cancelled_reason}</span>}
              </div>
              {student && <JoinButton session={{ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status, hasLink: Boolean(s.meeting_url) }} />}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}

/** Month grid; each day lists its sessions as links. */
export async function SessionCalendar({ month, today, sessions, hrefFor }: { month: string; today: string; sessions: SessionListItem[]; hrefFor: (month: string) => string }) {
  const t = await getT()
  const byDay = Map.groupBy(sessions, (s) => s.session_date)
  const weeks = monthGrid(month)
  return (
    <section aria-label={t("Online sessions, {monthLabel}", { monthLabel: monthLabel(month) })} className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t(monthLabel(month))}</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" asChild>
            <Link href={hrefFor(shiftMonth(month, -1))} aria-label={t("Previous month")}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(today.slice(0, 7))}>{t("This month")}</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={hrefFor(shiftMonth(month, 1))} aria-label={t("Next month")}>
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      </div>

      {/* Wide screens: a 7-column grid. */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="bg-muted text-muted-foreground grid grid-cols-7 text-xs font-medium">
          {WEEKDAYS.map((d) => (
            <div key={d.short} className="px-2 py-1.5">
              {t(d.short)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-t">
            {week.map((day) => (
              <div key={day.date} className={cn("min-h-24 border-l p-1.5 first:border-l-0", !day.inMonth && "bg-muted/40")}>
                <div className={cn("mb-1 text-xs tabular-nums", day.date === today ? "bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full" : "text-muted-foreground")}>
                  {Number(day.date.slice(8))}
                </div>
                <ul className="grid gap-1">
                  {(byDay.get(day.date) ?? []).map((s) => (
                    <li key={s.id}>
                      <CalendarEntry session={s} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Phones: an agenda of the days that have sessions. */}
      <ul className="grid gap-3 md:hidden">
        {weeks
          .flat()
          .filter((d) => d.inMonth && byDay.has(d.date))
          .map((d) => (
            <li key={d.date} className="grid gap-1">
              <span className="text-sm font-medium">{formatDate(d.date)}</span>
              {byDay.get(d.date)!.map((s) => (
                <CalendarEntry key={s.id} session={s} />
              ))}
            </li>
          ))}
        {!weeks.flat().some((d) => d.inMonth && byDay.has(d.date)) && <li className="text-muted-foreground text-sm">{t("No online sessions this month.")}</li>}
      </ul>
    </section>
  )
}

async function CalendarEntry({ session: s }: { session: SessionListItem }) {
  const t = await getT()
  const { icon: Icon } = STATUS_STYLE[s.status]
  return (
    <Link
      href={onlineSessionPath(s.id)}
      title={t("{title} · {value}", { title: s.title, value: STATUS_LABELS[s.status] })}
      className={cn(
        "hover:bg-muted flex items-start gap-1 rounded border px-1.5 py-1 text-xs",
        s.status === "cancelled" && "text-muted-foreground line-through",
        s.status === "live" && "border-emerald-600/50"
      )}
    >
      <Icon className="mt-0.5 size-3 shrink-0" aria-label={t(STATUS_LABELS[s.status])} />
      <span className="min-w-0">
        <span className="tabular-nums">{academyTime(s.starts_at)}</span> <span className="font-medium">{s.class?.name}</span>
        <span className="text-muted-foreground block truncate">{s.title}</span>
      </span>
    </Link>
  )
}

export const onlineTabHref = (view: string, extra: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams({ view })
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v)
  return `${routes.online}?${params}`
}
