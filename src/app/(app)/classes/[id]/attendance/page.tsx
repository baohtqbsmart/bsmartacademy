import { ArrowLeftIcon, CalendarXIcon, MonitorIcon, Trash2Icon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DELIVERY_MODE_LABELS } from "@/config/labels"
import { classAttendancePath, classPath, onlineSessionPath, routes } from "@/config/routes"
import { deleteRegisterAction } from "@/features/attendance/actions"
import { AttendanceRegister } from "@/features/attendance/components/attendance-register"
import { getRegister, listClassRegisters, loadAbsenceAlerts } from "@/features/attendance/server/attendance-service"
import { describeAlert, formatRate } from "@/features/attendance/summary"
import { getClass } from "@/features/classes/server/class-service"
import { onlineSessionOn } from "@/features/online/server/session-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { isIsoDate, isoWeekday, todayInAcademy, WEEKDAYS } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Take attendance") }
}

const TAKEABLE = new Set(["active", "completed"])

export default async function ClassAttendancePage({ params, searchParams }: PageProps<"/classes/[id]/attendance">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.classAttendance)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  // Teachers only see (and so only open) the classes they teach.
  const klass = await getClass(db, id)
  if (!klass) notFound()

  const today = todayInAcademy()
  const lastDay = klass.end_date && klass.end_date < today ? klass.end_date : today
  const requested = firstParam(await searchParams, "date")
  const date = isIsoDate(requested) ? requested : lastDay

  const inRange = (!klass.start_date || date >= klass.start_date) && date <= lastDay

  const [register, registers, alerts, online] = await Promise.all([
    getRegister(db, klass.id, date),
    listClassRegisters(db, klass.id),
    loadAbsenceAlerts(db, { classId: klass.id }),
    onlineSessionOn(db, klass.id, date),
  ])
  // On an online-lesson day an in-person class is taught like a hybrid one
  // (the database agrees: attendance defaults to online).
  const deliveryMode = online && klass.delivery_mode === "in_person" ? "hybrid" : klass.delivery_mode
  const alertByStudent = new Map(alerts.map((a) => [a.student_id, { level: a.level, text: describeAlert(a) }]))
  const scheduled = klass.class_schedule_slots.some((slot) => slot.weekday === isoWeekday(date))
  const scheduleDays = [...new Set(klass.class_schedule_slots.map((s) => s.weekday))].sort()

  let unavailable: string | null = null
  if (klass.deleted_at) unavailable = "This class is archived."
  else if (!TAKEABLE.has(klass.status)) unavailable = "Attendance can only be taken for active or completed classes."
  else if (date > today) unavailable = "Attendance cannot be taken for a future date."
  else if (!inRange) unavailable = "This date is outside the class dates."

  return (
    <>
      <Link href={classPath(klass.id)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {klass.name}
      </Link>
      <PageHeader
        title={t("Attendance")}
        description={t("{name} · {value}", { name: klass.name, value: DELIVERY_MODE_LABELS[klass.delivery_mode] })}
        actions={
          <Button variant="outline" asChild>
            <Link href={`${routes.attendance}?class=${klass.id}`}>{t("Class report")}</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="grid content-start gap-4">
          {/* A plain GET form: works before JavaScript loads. */}
          <form className="flex flex-wrap items-end gap-2" action={classAttendancePath(klass.id)}>
            <div className="grid gap-1">
              <Label htmlFor="register-date">{t("Date")}</Label>
              <Input
                id="register-date"
                name="date"
                type="date"
                className="w-44"
                defaultValue={date}
                min={klass.start_date ?? undefined}
                max={lastDay}
                required
              />
            </div>
            <Button type="submit" variant="outline">
              {t("Open register")}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{formatDate(date)}</span>
            {register.session ? (
              <Badge variant="secondary">
                {t("Taken by {value}", { value: register.session.recorded_by_name || "staff" })}
              </Badge>
            ) : (
              <Badge variant="outline">{t("Not taken yet")}</Badge>
            )}
            {!scheduled && scheduleDays.length > 0 && (
              <span className="text-muted-foreground">
                {t("Not a scheduled day (classes on")} {scheduleDays.map((d) => WEEKDAYS[d - 1].short).join(", ")}{t(") — fine for make-up sessions.")}
              </span>
            )}
          </div>

          {online && (
            <p className="flex flex-wrap items-center gap-1 text-sm">
              <MonitorIcon className="size-4" aria-hidden />
              {t("Online lesson this day:")}
              <Link href={onlineSessionPath(online.id)} className="underline">
                {online.title}
              </Link>
              <span className="text-muted-foreground">{t("— students are marked as attending online unless you untick it.")}</span>
            </p>
          )}
          {!online && klass.delivery_mode !== "in_person" && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
              <MonitorIcon className="size-4" aria-hidden />
              {klass.delivery_mode === "online"
                ? t("Online class: attendance is recorded as online.")
                : t("Hybrid class: tick “Online” for students who joined remotely.")}
              {klass.meeting_url && (
                <a href={klass.meeting_url} target="_blank" rel="noreferrer" className="break-all underline">
                  {t("Meeting link")}
                </a>
              )}
            </p>
          )}

          {unavailable ? (
            <Card>
              <CardContent>
                <EmptyState icon={CalendarXIcon} title={t("No register for this date")} description={unavailable} />
              </CardContent>
            </Card>
          ) : register.rows.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState icon={UsersIcon} title={t("No students were enrolled on this date")} />
              </CardContent>
            </Card>
          ) : (
            <AttendanceRegister
              key={date}
              classId={klass.id}
              date={date}
              deliveryMode={deliveryMode}
              defaultOnline={Boolean(online)}
              sessionNotes={register.session?.notes ?? ""}
              rows={register.rows.map((row) => ({ ...row, alert: alertByStudent.get(row.student.id) ?? null }))}
            />
          )}

          {register.session && can(user.permissions, "attendance.write", ["all"]) && (
            <div>
              <ConfirmActionButton
                variant="ghost"
                title={t("Delete this register?")}
                description={t("All attendance recorded for {date} in this class will be deleted. Use this only for a register taken on the wrong date.", { date: formatDate(date) })}
                confirmLabel={t("Delete register")}
                successMessage={t("Register deleted.")}
                destructive
                action={deleteRegisterAction.bind(null, { sessionId: register.session.id })}
              >
                <Trash2Icon aria-hidden /> {t("Delete register")}
              </ConfirmActionButton>
            </div>
          )}
        </section>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("Registers taken")}</CardTitle>
          </CardHeader>
          <CardContent>
            {registers.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("None yet.")}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {registers.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={classAttendancePath(klass.id, r.session_date)}
                      aria-current={r.session_date === date ? "page" : undefined}
                      className="hover:bg-muted aria-[current=page]:bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-1"
                    >
                      <span className="tabular-nums">{formatDate(r.session_date)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {r.counts.absent > 0 && t("{absent} absent · ", { absent: r.counts.absent })}
                        {formatRate(r.rate)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
