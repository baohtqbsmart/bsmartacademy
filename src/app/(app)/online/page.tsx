import { CalendarDaysIcon, HistoryIcon, PlusIcon, VideoIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { TabNav } from "@/components/shared/tab-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { onlineTabHref, SessionCalendar, SessionList } from "@/features/online/components/session-views"
import { listOnlineClasses, listSessions } from "@/features/online/server/session-service"
import { isUpcoming, parseMonth } from "@/features/online/sessions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { addDays, todayInAcademy } from "@/lib/dates"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Online classes") }
}

const VIEWS = ["upcoming", "past", "calendar"] as const
const PAST_LIMIT = 100

export default async function OnlinePage({ searchParams }: PageProps<"/online">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.online)
  const params = await searchParams
  const db = await createClient()
  const staff = can(user.permissions, "online.read", ["all", "assigned"])
  const canWrite = can(user.permissions, "online.write")
  // Only students join; parents follow their children's sessions.
  const student = can(user.permissions, "online.read", ["own"])
  const view = enumParam(params, "view", VIEWS) ?? "upcoming"
  const classId = staff ? uuidParam(params, "class") : undefined
  const today = todayInAcademy()
  const month = parseMonth(firstParam(params, "month"), today)
  const now = new Date()

  const [sessions, classes] = await Promise.all([
    view === "upcoming"
      ? listSessions(db, { classId, from: addDays(today, -1) }).then((all) => all.filter((s) => isUpcoming(s, now)))
      : view === "past"
        ? listSessions(db, { classId, to: today, latestFirst: true, limit: PAST_LIMIT + 5 }).then((all) => all.filter((s) => !isUpcoming(s, now)).slice(0, PAST_LIMIT))
        : // The calendar grid shows a few days of the neighbouring months.
          listSessions(db, { classId, from: addDays(`${month}-01`, -7), to: addDays(`${month}-01`, 42) }),
    staff ? listOnlineClasses(db) : [],
  ])

  const hrefFor = (v: string) => onlineTabHref(v, { class: classId, month: v === "calendar" ? firstParam(params, "month") : undefined })

  return (
    <>
      <PageHeader
        title={t("Online classes")}
        description={
          staff
            ? t("Lessons taught in Google Meet, Zoom or Microsoft Teams: schedule, materials, attendance, homework and notes.")
            : t("Join your online lessons, and find their materials, recordings and homework.")
        }
        actions={
          canWrite && (
            <Button asChild>
              <Link href={classId ? `${routes.onlineNew}?class=${classId}` : routes.onlineNew}>
                <PlusIcon aria-hidden /> {t("New online session")}
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabNav
          label={t("Online sessions")}
          active={view}
          tabs={[
            { value: "upcoming", label: "Upcoming", href: hrefFor("upcoming") },
            { value: "past", label: "Past", href: hrefFor("past") },
            { value: "calendar", label: "Calendar", href: hrefFor("calendar") },
          ]}
        />
        {staff && (
          <ListFilters
            basePath={routes.online}
            values={{ class: classId }}
            preserve={{ view, month: view === "calendar" ? month : undefined }}
            filters={[{ param: "class", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) }]}
          />
        )}
      </div>

      {view === "calendar" ? (
        <SessionCalendar month={month} today={today} sessions={sessions} hrefFor={(m) => onlineTabHref("calendar", { class: classId, month: m })} />
      ) : (
        <SessionList
          sessions={sessions}
          student={student && view === "upcoming"}
          empty={
            <Card>
              <CardContent>
                <EmptyState
                  icon={view === "past" ? HistoryIcon : VideoIcon}
                  title={view === "past" ? t("No past online sessions") : t("No upcoming online sessions")}
                  description={canWrite && view === "upcoming" ? t("Schedule one with “New online session”.") : undefined}
                  action={
                    view === "upcoming" ? (
                      <Button variant="outline" asChild>
                        <Link href={hrefFor("calendar")}>
                          <CalendarDaysIcon aria-hidden /> {t("Open the calendar")}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          }
        />
      )}
      {view === "past" && sessions.length === PAST_LIMIT && (
        <p className="text-muted-foreground text-sm">{t("Showing the latest {PAST_LIMIT}. Use the calendar or the class filter for older sessions.", { PAST_LIMIT })}</p>
      )}
    </>
  )
}
