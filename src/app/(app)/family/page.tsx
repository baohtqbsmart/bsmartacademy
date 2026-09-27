import { ArrowRightIcon, CalendarDaysIcon, CheckCircle2Icon, CircleAlertIcon, ClockIcon, MessageSquareIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { TabNav } from "@/components/shared/tab-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analyticsStudentPath, assignmentPath, onlineSessionPath, routes } from "@/config/routes"
import { AnnouncementList } from "@/features/communication/components/announcement-list"
import { listAnnouncements } from "@/features/communication/server/communication-service"
import { getChildOverview, listChildren } from "@/features/family/server/family-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { WEEKDAYS } from "@/lib/dates"
import { formatDate, formatDateTime } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "My family" }

const num = (v: number | string | null) => (v === null ? "—" : String(Math.round(Number(v) * 100) / 100))
const PAYMENT_LABELS: Record<string, string> = { paid: "Paid", partially_paid: "Partly paid", unpaid: "Unpaid", overdue: "Overdue" }

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  await requireRouteAccess(routes.family)
  const db = await createClient()
  const children = await listChildren(db)

  if (children.length === 0) {
    return (
      <>
        <PageHeader title="My family" />
        <Card>
          <CardContent>
            <EmptyState icon={UsersIcon} title="No children linked to your account" description="Ask the academy office to link your children to your account." />
          </CardContent>
        </Card>
      </>
    )
  }

  const requested = firstParam(await searchParams, "child")
  const child = children.find((c) => c.id === requested) ?? children[0]
  const [o, announcements] = await Promise.all([getChildOverview(db, child.id), listAnnouncements(db, { limit: 4 })])
  if (!o) return null
  const { student } = o
  const slots = o.classes
    .flatMap((c) => c.class_schedule_slots.map((s) => ({ ...s, className: c.name })))
    .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at))
  const upcoming = o.homework.filter((h) => !h.handedIn && !h.overdue)
  const missing = o.homework.filter((h) => h.overdue)
  const owed = o.invoices.reduce((sum, i) => sum + Number(i.remaining), 0)

  return (
    <>
      <PageHeader
        title="My family"
        description="Everything about your child in one place. Read-only: grades and attendance are recorded by teachers."
        actions={
          <Button variant="outline" asChild>
            <Link href={routes.messages}>
              <MessageSquareIcon aria-hidden /> Message a teacher
            </Link>
          </Button>
        }
      />
      {children.length > 1 && <TabNav label="Children" active={child.id} tabs={children.map((c) => ({ value: c.id, label: c.full_name, href: `${routes.family}?child=${c.id}` }))} />}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Profile" className="xl:col-span-1">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{student.full_name}</dd>
            <dt className="text-muted-foreground">Student code</dt>
            <dd className="font-mono">{student.student_code}</dd>
            {student.date_of_birth && (
              <>
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd>{formatDate(student.date_of_birth)}</dd>
              </>
            )}
            {student.school_name && (
              <>
                <dt className="text-muted-foreground">School</dt>
                <dd>{student.school_name}</dd>
              </>
            )}
            <dt className="text-muted-foreground">English level</dt>
            <dd>
              {student.level ? student.level.name : "Not recorded"}
              {student.target && <span className="text-muted-foreground"> → target {student.target.name}</span>}
            </dd>
          </dl>
        </Section>

        <Section title="Classes and schedule" className="xl:col-span-2" link={{ href: routes.timetable, label: "Timetable" }}>
          {o.classes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Not enrolled in a class right now.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ul className="grid content-start gap-2 text-sm">
                {o.classes.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name}</span>
                    {c.enrollmentStatus === "pending" && <Badge variant="outline" className="ml-2">Starting soon</Badge>}
                    <span className="text-muted-foreground block text-xs">
                      {c.course?.name} · {c.class_members.map((m) => m.teacher?.full_name).filter(Boolean).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="grid content-start gap-1 text-sm" aria-label="Weekly schedule">
                {slots.map((s, i) => (
                  <li key={i} className="flex gap-2 tabular-nums">
                    <span className="w-9 font-medium">{WEEKDAYS[s.weekday - 1].short}</span>
                    <span>
                      {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {s.className}
                      {s.room && ` · ${s.room}`}
                    </span>
                  </li>
                ))}
                {o.online.map((s) => (
                  <li key={s.id} className="flex gap-2 text-xs">
                    <CalendarDaysIcon className="size-3.5 shrink-0" aria-hidden />
                    <Link href={onlineSessionPath(s.id)} className="hover:underline">
                      Online: {s.title} · {formatDateTime(s.starts_at)}
                      {s.status === "cancelled" && " (cancelled)"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Attendance" description={`Last 30 days (since ${formatDate(o.attendance.from)})`} link={{ href: routes.attendance, label: "History" }}>
          <p className="text-2xl font-semibold tabular-nums">{o.attendance.rate === null ? "—" : `${Math.round(o.attendance.rate * 100)}%`}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {o.attendance.counts.present} present · {o.attendance.counts.late} late · {o.attendance.counts.absent} absent · {o.attendance.counts.excused} excused
          </p>
          {o.attendance.recentAbsences.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm">
              {o.attendance.recentAbsences.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span>
                    {formatDate(r.session_date)} · {r.class?.name}
                  </span>
                  <Badge variant="outline">{r.status === "absent" ? "Absent" : `Late${r.minutes_late ? ` ${r.minutes_late} min` : ""}`}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Homework" description="Due in the last and next two weeks" link={{ href: routes.assignments, label: "All assignments" }}>
          {o.homework.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing due.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {[...missing, ...upcoming, ...o.homework.filter((h) => h.handedIn)].slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-2">
                  <Link href={assignmentPath(h.id)} className="min-w-0 hover:underline">
                    <span className="block truncate">{h.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {h.class?.name} · due {h.due_at ? formatDateTime(h.due_at) : "—"}
                    </span>
                  </Link>
                  {h.handedIn ? (
                    <Badge variant="outline" className="shrink-0">
                      <CheckCircle2Icon aria-hidden /> {h.late ? "Handed in late" : "Handed in"}
                    </Badge>
                  ) : h.overdue ? (
                    <Badge variant="outline" className="shrink-0 border-[#b02a2a]/40 text-[#b02a2a] dark:text-[#ef7b7b]">
                      <CircleAlertIcon aria-hidden /> Missing
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">
                      <ClockIcon aria-hidden /> To do
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Progress" description="Last 90 days" link={{ href: analyticsStudentPath(student.id), label: "Full progress" }}>
          <p className="text-2xl font-semibold tabular-nums">{o.progress.averagePercent === null ? "—" : `${o.progress.averagePercent}%`}</p>
          <p className="text-muted-foreground text-xs">
            {o.progress.scored ? `Average percentage of ${o.progress.scored} published result${o.progress.scored === 1 ? "" : "s"}` : "No published results yet"}
            {o.progress.lowConfidence && " — few results, read with care"}
          </p>
        </Section>

        <Section title="Assignment results" description="Returned by teachers">
          {o.grades.length === 0 ? (
            <p className="text-muted-foreground text-sm">No returned grades yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {o.grades.map((g) => (
                <li key={g.submission_id} className="grid gap-0.5">
                  <span className="flex justify-between gap-2">
                    <Link href={assignmentPath(g.submission.assignment?.id ?? "")} className="truncate hover:underline">
                      {g.submission.assignment?.title}
                    </Link>
                    <span className="shrink-0 font-medium tabular-nums">
                      {num(g.score)} / {num(g.submission.assignment?.max_score ?? null)}
                    </span>
                  </span>
                  {g.feedback && <span className="text-muted-foreground line-clamp-2 text-xs">“{g.feedback}” — {g.graded_by_name}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Test results" link={{ href: routes.tests, label: "Tests" }}>
          {o.tests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No marked tests yet.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {o.tests.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {t.test?.title}
                    {t.attempt_number > 1 && <span className="text-muted-foreground text-xs"> (attempt {t.attempt_number})</span>}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {num(t.score)} / {num(t.test?.total_score ?? null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Teacher feedback">
          {o.feedback.length === 0 && o.assessmentFeedback.length === 0 ? (
            <p className="text-muted-foreground text-sm">No feedback yet.</p>
          ) : (
            <ul className="grid gap-3 text-sm">
              {o.feedback.map((f) => (
                <li key={f.id}>
                  <p className="whitespace-pre-wrap">{f.body}</p>
                  <span className="text-muted-foreground text-xs">
                    {f.author_name} · {formatDate(f.created_at.slice(0, 10))}
                  </span>
                </li>
              ))}
              {o.assessmentFeedback.map((a) => (
                <li key={a.submission_id}>
                  <span className="font-medium">{a.submission.task?.title}</span>
                  {a.feedback && <p className="line-clamp-3 whitespace-pre-wrap">{a.feedback}</p>}
                  <span className="text-muted-foreground text-xs">{a.graded_by_name} · teacher assessment</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tuition" description={owed > 0 ? `${formatVnd(owed)} still to pay on these invoices` : "Nothing outstanding on recent invoices"} link={{ href: routes.tuition, label: "Tuition and receipts" }}>
          {o.invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">No invoices.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {o.invoices.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{i.description}</span>
                    <span className="text-muted-foreground text-xs">
                      {i.invoice_number} · due {formatDate(i.due_date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums">{formatVnd(Number(i.amount))}</span>
                    <Badge variant="outline" className={i.payment_status === "overdue" ? "border-[#b02a2a]/40 text-[#b02a2a] dark:text-[#ef7b7b]" : undefined}>
                      {PAYMENT_LABELS[i.payment_status] ?? i.payment_status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Payment history">
          {o.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payments recorded.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {o.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {formatDate(p.paid_on)} <span className="text-muted-foreground text-xs">· {p.receipt_number}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatVnd(Number(p.amount))}
                    {p.status === "voided" && <Badge variant="outline" className="ml-1">Voided</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Announcements" className="xl:col-span-3" link={{ href: routes.announcements, label: "All announcements" }}>
          {announcements.length === 0 ? <p className="text-muted-foreground text-sm">No announcements.</p> : <AnnouncementList items={announcements} compact />}
        </Section>
      </div>
    </>
  )
}

function Section({ title, description, link, className, children }: { title: string; description?: string; link?: { href: string; label: string }; className?: string; children: React.ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          {link && (
            <Link href={link.href} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-normal">
              {link.label} <ArrowRightIcon className="size-3" aria-hidden />
            </Link>
          )}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-1">{children}</CardContent>
    </Card>
  )
}
