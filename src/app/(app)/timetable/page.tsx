import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { listAssignableTeachers } from "@/features/teachers/server/teacher-service"
import { WeekTimetable } from "@/features/timetable/components/week-timetable"
import { listChildrenByClass, listTimetableEntries } from "@/features/timetable/server/timetable-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { addDays, parseWeek, todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { uuidParam, withParams } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Timetable" }

export default async function TimetablePage({ searchParams }: PageProps<"/timetable">) {
  const user = await requireRouteAccess(routes.timetable)
  const params = await searchParams
  const monday = parseWeek(Array.isArray(params.week) ? params.week[0] : params.week)
  const today = todayInAcademy()

  const seesAll = can(user.permissions, "classes.read", ["all"])
  const isParent = can(user.permissions, "classes.read", ["children"])
  const teacherId = seesAll ? uuidParam(params, "teacher") : undefined

  const db = await createClient()
  const [entries, teachers, childrenByClass] = await Promise.all([
    listTimetableEntries(db, { teacherId }),
    seesAll ? listAssignableTeachers(db) : [],
    isParent ? listChildrenByClass(db) : undefined,
  ])

  const description = seesAll
    ? "All classes across the academy."
    : can(user.permissions, "classes.read", ["assigned"])
      ? "Your teaching schedule."
      : isParent
        ? "Your children's classes."
        : "Your class schedule."
  const weekHref = (week: string) => withParams(routes.timetable, { week, teacher: teacherId })

  return (
    <>
      <PageHeader title="Timetable" description={description} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href={weekHref(addDays(monday, -7))} aria-label="Previous week" scroll={false}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={weekHref(today)} scroll={false}>
              This week
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={weekHref(addDays(monday, 7))} aria-label="Next week" scroll={false}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <span className="text-sm font-medium">
            {formatDate(monday)} – {formatDate(addDays(monday, 6))}
          </span>
        </div>
        {seesAll && (
          <ListFilters
            basePath={routes.timetable}
            values={{ teacher: teacherId }}
            preserve={{ week: monday }}
            filters={[
              {
                param: "teacher",
                allLabel: "All teachers",
                options: teachers.map((t) => ({ value: t.id, label: t.full_name })),
              },
            ]}
          />
        )}
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="Nothing scheduled"
          description={
            seesAll
              ? "No planned or running class has timetable slots yet."
              : "You have no planned or running classes with a timetable."
          }
        />
      ) : (
        <WeekTimetable monday={monday} today={today} entries={entries} childrenByClass={childrenByClass} />
      )}
    </>
  )
}
