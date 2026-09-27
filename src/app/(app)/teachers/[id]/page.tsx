import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, AwardIcon, PencilIcon, Trash2Icon } from "lucide-react"
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
import { CLASS_MEMBER_ROLE_LABELS, CLASS_STATUS, STAFF_STATUS } from "@/config/labels"
import { classPath, routes, teacherEditPath } from "@/config/routes"
import { listSubjectOptions } from "@/features/subjects/server/subject-service"
import { archiveTeacherAction, removeQualificationAction, restoreTeacherAction } from "@/features/teachers/actions"
import { AddQualificationDialog, TeacherSubjectsDialog } from "@/features/teachers/components/teacher-dialogs"
import { getTeacher } from "@/features/teachers/server/teacher-service"
import { WeeklySlots } from "@/features/timetable/components/weekly-slots"
import { listTimetableEntries } from "@/features/timetable/server/timetable-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate, formatDateRange } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Teacher" }

export default async function TeacherPage({ params }: PageProps<"/teachers/[id]">) {
  const user = await requireRouteAccess(routes.teacherDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const teacher = await getTeacher(db, id)
  if (!teacher) notFound()

  const canWrite = can(user.permissions, "teachers.write")
  const [subjects, schedule] = await Promise.all([
    canWrite ? listSubjectOptions(db) : [],
    listTimetableEntries(db, { teacherId: teacher.id }),
  ])

  const classes = teacher.class_members
    .filter((m) => m.class && !m.class.deleted_at)
    .sort((a, b) => (b.class!.start_date ?? "").localeCompare(a.class!.start_date ?? ""))
  const quals = [...teacher.teacher_qualifications].sort((a, b) => (b.year_awarded ?? 0) - (a.year_awarded ?? 0))

  return (
    <>
      <Link href={routes.teachers} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Teachers
      </Link>
      <PageHeader
        title={teacher.full_name}
        description={teacher.teacher_code}
        actions={
          <>
            <Badge variant={STAFF_STATUS[teacher.status].variant}>{STAFF_STATUS[teacher.status].label}</Badge>
            {teacher.deleted_at && <Badge variant="destructive">Archived</Badge>}
            {canWrite && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={teacherEditPath(teacher.id)}>
                    <PencilIcon aria-hidden /> Edit
                  </Link>
                </Button>
                {teacher.deleted_at ? (
                  <ConfirmActionButton
                    title="Restore teacher?"
                    description="The teacher can be assigned to classes again."
                    confirmLabel="Restore"
                    successMessage="Teacher restored."
                    action={restoreTeacherAction.bind(null, { teacherId: teacher.id })}
                  >
                    <ArchiveRestoreIcon aria-hidden /> Restore
                  </ConfirmActionButton>
                ) : (
                  <ConfirmActionButton
                    title="Archive teacher?"
                    description="Only possible once they no longer teach planned or running classes."
                    confirmLabel="Archive"
                    successMessage="Teacher archived."
                    destructive
                    action={archiveTeacherAction.bind(null, { teacherId: teacher.id })}
                  >
                    <ArchiveIcon aria-hidden /> Archive
                  </ConfirmActionButton>
                )}
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Detail label="Email">{teacher.email}</Detail>
            <Detail label="Phone">{teacher.phone}</Detail>
            <Detail label="Start date">{teacher.hired_on && formatDate(teacher.hired_on)}</Detail>
            {/* teacher_notes() returns notes only to teacher editors. */}
            {teacher.notes !== null && (
              <Detail label="Internal notes">
                <span className="whitespace-pre-line">{teacher.notes}</span>
              </Detail>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
            {canWrite && (
              <CardAction>
                <TeacherSubjectsDialog
                  teacherId={teacher.id}
                  subjects={subjects}
                  selected={teacher.teacher_subjects.flatMap((ts) => (ts.subject ? [ts.subject.id] : []))}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {teacher.teacher_subjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">No subjects recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {teacher.teacher_subjects.map((ts) =>
                  ts.subject ? (
                    <Badge key={ts.subject.id} variant="secondary">
                      {ts.subject.name}
                    </Badge>
                  ) : null
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Teaching schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklySlots
              slots={schedule.map((e) => ({
                id: e.slot_id,
                weekday: e.weekday,
                starts_at: e.starts_at,
                ends_at: e.ends_at,
                room: e.delivery_mode === "online" ? "Online" : e.room,
                label: e.class_name,
              }))}
              empty="No scheduled classes."
            />
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Qualifications</h2>
          {canWrite && <AddQualificationDialog teacherId={teacher.id} />}
        </div>
        <SimpleTable
          rows={quals}
          rowKey={(q) => q.id}
          empty={<EmptyState icon={AwardIcon} title="No qualifications recorded" />}
          columns={[
            { header: "Qualification", cell: (q) => <span className="font-medium">{q.title}</span> },
            { header: "Institution", cell: (q) => q.institution ?? "—" },
            { header: "Year", cell: (q) => q.year_awarded ?? "—" },
            ...(canWrite
              ? [
                  {
                    header: "",
                    key: "actions",
                    className: "text-right",
                    cell: (q: (typeof quals)[number]) => (
                      <ConfirmActionButton
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${q.title}`}
                        title="Remove qualification?"
                        description={q.title}
                        confirmLabel="Remove"
                        successMessage="Qualification removed."
                        destructive
                        action={removeQualificationAction.bind(null, { qualificationId: q.id })}
                      >
                        <Trash2Icon />
                      </ConfirmActionButton>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Classes</h2>
        <SimpleTable
          rows={classes}
          rowKey={(m) => m.class!.id}
          empty="No classes you can see."
          columns={[
            {
              header: "Class",
              cell: (m) => (
                <Link href={classPath(m.class!.id)} className="font-medium hover:underline">
                  {m.class!.name}
                </Link>
              ),
            },
            { header: "Course", cell: (m) => m.class!.course?.name ?? "—" },
            { header: "Role", cell: (m) => CLASS_MEMBER_ROLE_LABELS[m.member_role] },
            { header: "Dates", cell: (m) => formatDateRange(m.class!.start_date, m.class!.end_date) },
            {
              header: "Status",
              cell: (m) => <Badge variant={CLASS_STATUS[m.class!.status].variant}>{CLASS_STATUS[m.class!.status].label}</Badge>,
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
      <span>{children || "—"}</span>
    </div>
  )
}
