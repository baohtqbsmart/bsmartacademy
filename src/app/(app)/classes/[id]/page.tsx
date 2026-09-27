import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, CalendarCheckIcon, PencilIcon, Trash2Icon, UserMinusIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CLASS_MEMBER_ROLE_LABELS, CLASS_STATUS, DELIVERY_MODE_LABELS, ENROLLMENT_STATUS } from "@/config/labels"
import { classAttendancePath, classEditPath, coursePath, routes, studentPath, teacherPath } from "@/config/routes"
import { listClassRegisters } from "@/features/attendance/server/attendance-service"
import { formatRate } from "@/features/attendance/summary"
import {
  archiveClassAction,
  deleteSlotAction,
  removeTeacherAction,
  restoreClassAction,
} from "@/features/classes/actions"
import { AssignTeacherDialog, ChangeRoleButton, SlotDialog } from "@/features/classes/components/class-dialogs"
import { getClass, listEnrollableStudents, listOpenClasses } from "@/features/classes/server/class-service"
import { setEnrollmentStatusAction } from "@/features/enrollments/actions"
import { EnrollDialog, EnrollmentActions } from "@/features/enrollments/components/enrollment-dialogs"
import { listAssignableTeachers } from "@/features/teachers/server/teacher-service"
import { sortSlots } from "@/features/timetable/components/weekly-slots"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatTime, WEEKDAYS } from "@/lib/dates"
import { formatDate, formatDateRange } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Class" }

const SEATED = new Set(["pending", "active"])

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const user = await requireRouteAccess(routes.classDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  // Classes the caller may not see come back empty from RLS: same 404.
  const klass = await getClass(db, id)
  if (!klass) notFound()

  const canWrite = can(user.permissions, "classes.write")
  const canEnroll = can(user.permissions, "enrollments.write")
  const canReadAttendance = can(user.permissions, "attendance.read")
  // RLS: only teachers of this class (or academy staff) may take attendance.
  const canTakeAttendance = can(user.permissions, "attendance.write") && (klass.status === "active" || klass.status === "completed")
  const [teacherOptions, studentOptions, classOptions, registers] = await Promise.all([
    canWrite ? listAssignableTeachers(db) : [],
    canEnroll ? listEnrollableStudents(db) : [],
    canEnroll ? listOpenClasses(db) : [],
    canReadAttendance ? listClassRegisters(db, klass.id, 5) : [],
  ])

  const isLead = (m: { member_role: string }) => Number(m.member_role === "lead_teacher")
  const members = [...klass.class_members].sort((a, b) => isLead(b) - isLead(a))
  const enrollments = [...klass.enrollments].sort(
    (a, b) => Number(SEATED.has(b.status)) - Number(SEATED.has(a.status)) || (a.student?.full_name ?? "").localeCompare(b.student?.full_name ?? "")
  )
  const seated = enrollments.filter((e) => SEATED.has(e.status))
  const seatedIds = new Set(seated.map((e) => e.student?.id))
  const slots = sortSlots(klass.class_schedule_slots)
  const assignedIds = new Set(members.map((m) => m.teacher?.id))

  return (
    <>
      <Link href={routes.classes} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Classes
      </Link>
      <PageHeader
        title={klass.name}
        description={klass.code}
        actions={
          <>
            <Badge variant={CLASS_STATUS[klass.status].variant}>{CLASS_STATUS[klass.status].label}</Badge>
            {klass.deleted_at && <Badge variant="destructive">Archived</Badge>}
            {canWrite && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={classEditPath(klass.id)}>
                    <PencilIcon aria-hidden /> Edit
                  </Link>
                </Button>
                {klass.deleted_at ? (
                  <ConfirmActionButton
                    title="Restore class?"
                    description="The class returns to lists and timetables (clashes are re-checked)."
                    confirmLabel="Restore"
                    successMessage="Class restored."
                    action={restoreClassAction.bind(null, { classId: klass.id })}
                  >
                    <ArchiveRestoreIcon aria-hidden /> Restore
                  </ConfirmActionButton>
                ) : (
                  <ConfirmActionButton
                    title="Archive class?"
                    description="Archived classes disappear from timetables and from teachers', students' and parents' views."
                    confirmLabel="Archive"
                    successMessage="Class archived."
                    destructive
                    action={archiveClassAction.bind(null, { classId: klass.id })}
                  >
                    <ArchiveIcon aria-hidden /> Archive
                  </ConfirmActionButton>
                )}
              </>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Detail label="Course">
            {klass.course ? (
              <Link href={coursePath(klass.course.id)} className="hover:underline">
                {klass.course.name}
              </Link>
            ) : null}
          </Detail>
          <Detail label="Subject">{klass.course?.subject?.name}</Detail>
          <Detail label="Level">{klass.course?.level?.name}</Detail>
          <Detail label="Dates">{formatDateRange(klass.start_date, klass.end_date)}</Detail>
          <Detail label="Delivery">
            {DELIVERY_MODE_LABELS[klass.delivery_mode]}
            {klass.delivery_mode !== "online" && klass.room && ` · Room ${klass.room}`}
          </Detail>
          <Detail label="Students">
            {seated.length}
            {klass.capacity && ` / ${klass.capacity}`}
          </Detail>
          {klass.meeting_url && klass.delivery_mode !== "in_person" && (
            <Detail label="Meeting link">
              <a href={klass.meeting_url} target="_blank" rel="noreferrer" className="break-all underline">
                {klass.meeting_url}
              </a>
            </Detail>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Teachers</CardTitle>
            {canWrite && (
              <CardAction>
                <AssignTeacherDialog
                  classId={klass.id}
                  hasLead={members.some((m) => m.member_role === "lead_teacher")}
                  teachers={teacherOptions
                    .filter((t) => !assignedIds.has(t.id))
                    .map((t) => ({ id: t.id, label: `${t.full_name} (${t.teacher_code})` }))}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <EmptyState icon={UsersIcon} title="No teacher assigned" />
            ) : (
              <ul className="grid gap-3">
                {members.map((member) =>
                  member.teacher ? (
                    <li key={member.teacher.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="grid text-sm">
                        <Link href={teacherPath(member.teacher.id)} className="font-medium hover:underline">
                          {member.teacher.full_name}
                        </Link>
                        <span className="text-muted-foreground">
                          {CLASS_MEMBER_ROLE_LABELS[member.member_role]} · since {formatDate(member.assigned_on)}
                        </span>
                      </div>
                      {canWrite && (
                        <div className="flex gap-1">
                          <ChangeRoleButton classId={klass.id} teacherId={member.teacher.id} role={member.member_role} />
                          <ConfirmActionButton
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${member.teacher.full_name}`}
                            title="Remove teacher from class?"
                            description={`${member.teacher.full_name} will no longer see this class or its students.`}
                            confirmLabel="Remove"
                            successMessage="Teacher removed."
                            destructive
                            action={removeTeacherAction.bind(null, { classId: klass.id, teacherId: member.teacher.id })}
                          >
                            <UserMinusIcon />
                          </ConfirmActionButton>
                        </div>
                      )}
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly timetable</CardTitle>
            {canWrite && (
              <CardAction>
                <SlotDialog classId={klass.id} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <p className="text-muted-foreground text-sm">No time slots yet.</p>
            ) : (
              <ul className="grid gap-2">
                {slots.map((slot) => (
                  <li key={slot.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="inline-block w-24 font-medium">{WEEKDAYS[slot.weekday - 1].label}</span>
                      <span className="tabular-nums">
                        {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                      </span>
                      {(slot.room ?? (klass.delivery_mode !== "online" ? klass.room : null)) && (
                        <span className="text-muted-foreground"> · {slot.room ?? klass.room}</span>
                      )}
                    </span>
                    {canWrite && (
                      <span className="flex gap-1">
                        <SlotDialog
                          classId={klass.id}
                          initial={{
                            slotId: slot.id,
                            weekday: String(slot.weekday),
                            startsAt: formatTime(slot.starts_at),
                            endsAt: formatTime(slot.ends_at),
                            room: slot.room ?? "",
                          }}
                        />
                        <ConfirmActionButton
                          variant="ghost"
                          size="icon"
                          aria-label="Delete time slot"
                          title="Delete time slot?"
                          description="It will disappear from everyone's timetable."
                          confirmLabel="Delete"
                          successMessage="Time slot deleted."
                          destructive
                          action={deleteSlotAction.bind(null, { slotId: slot.id })}
                        >
                          <Trash2Icon />
                        </ConfirmActionButton>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canReadAttendance && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardAction className="flex gap-2">
              {can(user.permissions, "attendance.read", ["all", "assigned"]) && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${routes.attendance}?class=${klass.id}`}>Report</Link>
                </Button>
              )}
              {canTakeAttendance && !klass.deleted_at && (
                <Button size="sm" asChild>
                  <Link href={classAttendancePath(klass.id)}>
                    <CalendarCheckIcon aria-hidden /> Take attendance
                  </Link>
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent>
            {registers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No registers taken yet.</p>
            ) : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-5">
                {registers.map((r) => (
                  <li key={r.id} className="grid">
                    {canTakeAttendance ? (
                      <Link href={classAttendancePath(klass.id, r.session_date)} className="font-medium hover:underline">
                        {formatDate(r.session_date)}
                      </Link>
                    ) : (
                      <span className="font-medium">{formatDate(r.session_date)}</span>
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      {formatRate(r.rate)} attended{r.counts.absent > 0 && ` · ${r.counts.absent} absent`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Students</h2>
          {canEnroll && (
            <EnrollDialog
              classId={klass.id}
              students={studentOptions
                .filter((s) => !seatedIds.has(s.id))
                .map((s) => ({ id: s.id, label: `${s.full_name} (${s.student_code})` }))}
            />
          )}
        </div>
        <SimpleTable
          rows={enrollments}
          rowKey={(e) => e.id}
          empty={<EmptyState icon={UsersIcon} title="No students in this class" />}
          columns={[
            {
              header: "Student",
              cell: (e) =>
                e.student ? (
                  <Link href={studentPath(e.student.id)} className="font-medium hover:underline">
                    {e.student.full_name}
                  </Link>
                ) : (
                  "—"
                ),
            },
            { header: "Student ID", cell: (e) => <span className="font-mono text-xs">{e.student?.student_code}</span> },
            { header: "Dates", cell: (e) => formatDateRange(e.enrolled_on, e.ended_on) },
            {
              header: canEnroll ? "Status / move" : "Status",
              key: "status",
              cell: (e) =>
                canEnroll ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <EnrollmentActions
                      enrollmentId={e.id}
                      status={e.status}
                      currentClassId={klass.id}
                      classes={classOptions.map((c) => ({ id: c.id, label: c.name }))}
                    />
                    {SEATED.has(e.status) && (
                      <ConfirmActionButton
                        variant="ghost"
                        title="Remove student from class?"
                        description="The enrolment is marked withdrawn; history is kept and they can be re-added."
                        confirmLabel="Remove"
                        successMessage="Student removed."
                        destructive
                        action={setEnrollmentStatusAction.bind(null, { enrollmentId: e.id, status: "withdrawn" })}
                      >
                        Remove
                      </ConfirmActionButton>
                    )}
                  </div>
                ) : (
                  <Badge variant={ENROLLMENT_STATUS[e.status].variant}>{ENROLLMENT_STATUS[e.status].label}</Badge>
                ),
            },
          ]}
        />
      </section>
    </>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{children || "—"}</span>
    </div>
  )
}
