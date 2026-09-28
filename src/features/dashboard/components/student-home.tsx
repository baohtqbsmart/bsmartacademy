import {
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FolderOpenIcon,
  PercentIcon,
  UserCheckIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { ProgressFill, Stagger, StaggerItem } from "@/components/motion/reveal"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, classPath, onlineSessionPath, routes } from "@/config/routes"
import { SKILL_NAMES } from "@/features/analytics/metrics"
import { courseProgress, type StudentDashboard } from "@/features/dashboard/server/student-dashboard"
import { translateNotificationTitle } from "@/features/communication/notification-text"
import { StreakCard } from "@/features/progress/components/learning-path"
import { getT } from "@/i18n/server"
import { formatTime } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The skills shown on the home screen (pronunciation lives on the progress page). */
const HOME_SKILLS = ["listening", "reading", "speaking", "writing", "grammar", "vocabulary"] as const

export async function StudentHome({ data }: { data: StudentDashboard }) {
  const t = await getT()
  const kpis: { label: string; value: string; hint: string; icon: LucideIcon; href: string }[] = [
    {
      label: "Current courses",
      value: String(data.classes.length),
      hint: data.classes.length ? t("In progress") : t("Not in a class"),
      icon: BookOpenIcon,
      href: routes.classes,
    },
    {
      label: "Assignments to hand in",
      value: String(data.open.length),
      hint: t("Not handed in yet"),
      icon: ClipboardListIcon,
      href: routes.assignments,
    },
    {
      label: "Average score",
      value: data.overall.averagePercent === null ? "—" : `${data.overall.averagePercent}%`,
      hint: t("Last {days} days", { days: data.resultsDays }),
      icon: PercentIcon,
      href: routes.analytics,
    },
    {
      label: "Attendance",
      value: data.attendanceRate === null ? "—" : `${Math.round(data.attendanceRate * 100)}%`,
      hint: t("Last {days} days", { days: data.attendanceDays }),
      icon: UserCheckIcon,
      href: routes.attendance,
    },
  ]

  return (
    <div className="grid gap-6">
      <Stagger className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <StaggerItem key={kpi.label}>
            <Link href={kpi.href} className="block h-full">
              <Card className="lift h-full gap-2 py-4">
                <CardContent className="grid gap-1 px-4">
                  <span className="text-muted-foreground flex items-center justify-between text-xs font-medium">
                    {t(kpi.label)}
                    <kpi.icon className="text-primary size-4" aria-hidden />
                  </span>
                  <span className="font-heading text-3xl font-semibold tabular-nums">{kpi.value}</span>
                  <span className="text-muted-foreground text-xs">{kpi.hint}</span>
                </CardContent>
              </Card>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Today's schedule")}</CardTitle>
            <SeeAll href={routes.timetable} label={t("Timetable")} />
          </CardHeader>
          <CardContent>
            {data.todaySlots.length === 0 && data.todaySessions.length === 0 ? (
              <Empty icon={CalendarClockIcon} text={t("No lessons today. Enjoy your free time!")} />
            ) : (
              <ol className="grid gap-2">
                {data.todaySlots.map((slot) => (
                  <li key={slot.slot_id}>
                    <Link href={classPath(slot.class_id)} className="hover:bg-muted/60 flex items-center gap-4 rounded-lg border p-3 transition-colors">
                      <span className="text-primary w-24 shrink-0 text-sm font-semibold tabular-nums">
                        {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{slot.class_name}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {[slot.subject_name, slot.lead_teacher_name, slot.room].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {data.todaySessions.map((session) => (
                  <li key={session.id}>
                    <Link href={onlineSessionPath(session.id)} className="hover:bg-muted/60 flex items-center gap-4 rounded-lg border p-3 transition-colors">
                      <span className="text-primary w-24 shrink-0 text-sm font-semibold tabular-nums">
                        {formatDateTime(session.starts_at).slice(-5)}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{session.title}</span>
                        <span className="text-muted-foreground truncate text-xs">{session.class?.name}</span>
                      </span>
                      <Badge variant={session.status === "live" ? "default" : "outline"} className="gap-1">
                        <VideoIcon className="size-3" aria-hidden /> {session.status === "live" ? t("Live now") : t("Online")}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6 lg:col-span-2">
          <StreakCard streak={data.streak} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("Learning progress")}</CardTitle>
              <SeeAll href={routes.analytics} label={t("Progress")} />
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3">
                {HOME_SKILLS.map((skill) => {
                  const summary = data.skills.find((s) => s.skill === skill)
                  const value = summary?.averagePercent ?? null
                  return (
                    <li key={skill} className="grid gap-1">
                      <span className="flex items-center justify-between text-sm">
                        {t(SKILL_NAMES[skill])}
                        <span className="text-muted-foreground tabular-nums">{value === null ? "—" : `${value}%`}</span>
                      </span>
                      <span className="bg-muted block h-2 overflow-hidden rounded-full" aria-hidden>
                        {value !== null && <ProgressFill value={value} className="bg-success rounded-full" />}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-muted-foreground mt-3 text-xs">{t("Published results of the last {days} days; “—” means no results yet.", { days: data.resultsDays })}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Due soon")}</CardTitle>
            <SeeAll href={routes.assignments} label={t("Assignments")} />
          </CardHeader>
          <CardContent>
            {data.open.length === 0 ? (
              <Empty icon={ClipboardListIcon} text={t("Nothing due. Well done!")} />
            ) : (
              <ul className="grid gap-2">
                {data.open.slice(0, 5).map((row) => (
                  <li key={row.key}>
                    <Link href={assignmentPath(row.assignment.id)} className="hover:bg-muted/60 grid rounded-lg border p-3 transition-colors">
                      <span className="truncate text-sm font-medium">{row.assignment.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {row.assignment.class?.name}
                        {row.assignment.due_at ? ` · ${t("due {dateTime}", { dateTime: formatDateTime(row.assignment.due_at) })}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("My courses")}</CardTitle>
            <SeeAll href={routes.classes} label={t("Courses")} />
          </CardHeader>
          <CardContent>
            {data.classes.length === 0 ? (
              <Empty icon={BookOpenIcon} text={t("You are not in a class yet. The academy office will enrol you.")} />
            ) : (
              <ul className="grid gap-3">
                {data.classes.slice(0, 4).map((klass) => {
                  const completed = data.completion.get(klass.id) ?? null
                  const progress = completed ?? courseProgress(klass.start_date, klass.end_date, data.today)
                  const lead = klass.class_members.find((m) => m.member_role === "lead_teacher")?.teacher?.full_name
                  return (
                    <li key={klass.id}>
                      <Link href={classPath(klass.id)} className="hover:bg-muted/60 grid gap-1.5 rounded-lg border p-3 transition-colors">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{klass.name}</span>
                          {klass.course?.subject?.name && <Badge variant="secondary">{klass.course.subject.name}</Badge>}
                        </span>
                        {lead && <span className="text-muted-foreground text-xs">{t("Teacher:")} {lead}</span>}
                        {progress !== null && (
                          <span className="grid gap-1">
                            <span className="bg-muted block h-1.5 overflow-hidden rounded-full" aria-hidden>
                              <ProgressFill value={progress} className={cn("rounded-full", completed !== null ? "bg-success" : "bg-primary")} />
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                              {completed !== null
                                ? t("{value}% of the learning path completed", { value: progress })
                                : t("{value}% of the course calendar", { value: progress })}
                            </span>
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("Notifications")}</CardTitle>
            <SeeAll href={routes.notifications} label={t("Notifications")} />
          </CardHeader>
          <CardContent>
            {data.notifications.length === 0 ? (
              <Empty icon={BellIcon} text={t("No notifications yet")} />
            ) : (
              <ul className="grid gap-2">
                {data.notifications.map((n) => (
                  <li key={n.id} className={cn("rounded-lg border p-3 text-sm", !n.read_at && "border-primary/30 bg-primary/5")}>
                    <span className={cn("block truncate", !n.read_at && "font-semibold")}>{translateNotificationTitle(t, n.title)}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(n.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <QuickActions
        actions={[
          { label: "Do assignments", href: routes.assignments, icon: ClipboardListIcon },
          { label: "View materials", href: routes.library, icon: FolderOpenIcon },
          { label: "View results", href: routes.analytics, icon: ChartColumnIcon },
          { label: "Join online class", href: routes.online, icon: VideoIcon },
        ]}
      />
    </div>
  )
}

export async function QuickActions({ actions }: { actions: { label: string; href: string; icon: LucideIcon }[] }) {
  const t = await getT()
  return (
    <section aria-labelledby="quick-actions" className="grid gap-3">
      <h2 id="quick-actions" className="text-lg font-semibold">
        {t("Quick actions")}
      </h2>
      <Stagger inView className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((action) => (
          <StaggerItem key={action.href}>
            <Link
              href={action.href}
              className="lift bg-card flex h-full flex-col items-center gap-2 rounded-xl border p-4 text-center text-sm font-medium"
            >
              <span className="bg-brand-cream text-primary flex size-11 items-center justify-center rounded-full">
                <action.icon className="size-5" aria-hidden />
              </span>
              {t(action.label)}
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-primary inline-flex items-center gap-0.5 text-xs font-medium">
      {label}
      <ChevronRightIcon className="size-3.5" aria-hidden />
    </Link>
  )
}

function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <p className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
      <span className="bg-muted flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      {text}
    </p>
  )
}
