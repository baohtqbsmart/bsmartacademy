import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, FolderOpenIcon, LockIcon, PencilIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { TabNav } from "@/components/shared/tab-nav"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { STUDENT_STATUS } from "@/config/labels"
import { analyticsStudentPath, libraryMaterialPath, routes, studentEditPath, studentPath } from "@/config/routes"
import { ResultsTable } from "@/features/analytics/components/analytics-cards"
import { parseRange } from "@/features/analytics/metrics"
import { loadResults } from "@/features/analytics/server/analytics-service"
import { FILE_KIND_LABELS, type FileKind } from "@/features/library/catalog"
import { listStudentMaterials } from "@/features/library/server/library-service"
import { StudentTests } from "@/features/tests/components/student-tests"
import { listTests } from "@/features/tests/server/test-service"
import { StudentWorkTable } from "@/features/assignments/components/student-work-table"
import { listStudentAssignments } from "@/features/assignments/server/assignment-service"
import { StudentAttendance, STUDENT_ATTENDANCE_DAYS } from "@/features/attendance/components/student-attendance"
import { listAttendanceHistory, loadAbsenceAlerts } from "@/features/attendance/server/attendance-service"
import { listOpenClasses } from "@/features/classes/server/class-service"
import { listParentOptions } from "@/features/parents/server/parent-service"
import { archiveStudentAction, restoreStudentAction } from "@/features/students/actions"
import { StudentPhotoUploader } from "@/features/students/components/student-photo-uploader"
import {
  StudentFeedback,
  StudentOverview,
  StudentProgress,
} from "@/features/students/components/student-profile-sections"
import { STUDENT_TABS, parseStudentTab } from "@/features/students/profile-tabs"
import { listFeedback } from "@/features/students/server/feedback-service"
import { getStudentProfile } from "@/features/students/server/student-service"
import { AssignTuitionDialog } from "@/features/tuition/components/tuition-dialogs"
import { TuitionOverview } from "@/features/tuition/components/tuition-overview"
import { loadTuitionOverview } from "@/features/tuition/server/overview-service"
import { listDiscountRules, listPlans } from "@/features/tuition/server/tuition-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { addDays, todayInAcademy } from "@/lib/dates"
import { formatVnd } from "@/lib/money"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Student profile") }
}

export default async function StudentProfilePage({ params, searchParams }: PageProps<"/students/[id]">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.studentDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const tab = parseStudentTab((await searchParams).tab)

  const db = await createClient()
  // RLS returns nothing for students the caller may not see: same 404 as a
  // non-existent id, so direct URLs reveal nothing.
  const student = await getStudentProfile(db, id)
  if (!student) notFound()

  const canEditStudent = can(user.permissions, "students.write")
  const canManageEnrollments = can(user.permissions, "enrollments.write")
  const canListStudents = can(user.permissions, "students.read", ["all", "assigned", "children"])
  const needsClassOptions = canManageEnrollments && (tab === "overview" || tab === "progress")

  // Financial data only for roles holding tuition.read (never teachers by
  // default); RLS limits it further to own / children / all.
  const canSeeTuition = can(user.permissions, "tuition.read")
  const canAssignTuition = can(user.permissions, "tuition.write")
  // Attendance: RLS limits a teacher to the classes they teach.
  const showAttendance = tab === "attendance" && can(user.permissions, "attendance.read")
  const assignmentViewer = can(user.permissions, "assignments.read", ["all", "assigned"]) ? "staff" : "family"

  const [photoUrl, parentOptions, classOptions, feedback, tuition, tuitionPlans, tuitionRules, attendance, absenceAlerts, work, tests] = await Promise.all([
    createSignedUrl(db, BUCKETS.studentPhotos, student.avatar_path),
    canEditStudent && tab === "overview" ? listParentOptions(db) : [],
    needsClassOptions ? listOpenClasses(db) : [],
    tab === "feedback" ? listFeedback(db, student.id) : [],
    tab === "tuition" && canSeeTuition ? loadTuitionOverview(db, student.id) : null,
    tab === "tuition" && canAssignTuition ? listPlans(db) : [],
    tab === "tuition" && canAssignTuition ? listDiscountRules(db) : [],
    showAttendance
      ? listAttendanceHistory(db, { studentId: student.id, from: addDays(todayInAcademy(), 1 - STUDENT_ATTENDANCE_DAYS) })
      : [],
    showAttendance ? loadAbsenceAlerts(db, { studentId: student.id }) : [],
    tab === "assignments" && can(user.permissions, "assignments.read") ? listStudentAssignments(db, assignmentViewer, student.id) : [],
    tab === "tests" && can(user.permissions, "tests.read") ? listTests(db, { status: "current" }) : [],
  ])
  const classChoices = classOptions.map((c) => ({ id: c.id, label: c.name }))
  // Grades: the student's published results of the last year (same data as the progress page).
  const canSeeGrades = can(user.permissions, "analytics.read")
  const grades = tab === "grades" && canSeeGrades ? await loadResults(db, parseRange(addDays(todayInAcademy(), -364), todayInAcademy()), { studentId: student.id }) : []
  const materials = tab === "materials" && can(user.permissions, "library.read") ? await listStudentMaterials(db, student.id) : []

  return (
    <>
      {canListStudents && (
        <Link href={routes.students} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeftIcon className="size-4" aria-hidden /> {tr("Students")}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {canEditStudent ? (
            <StudentPhotoUploader studentId={student.id} name={student.full_name} photoUrl={photoUrl} />
          ) : (
            <UserAvatar name={student.full_name} avatarUrl={photoUrl} className="size-20 text-xl" />
          )}
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{student.full_name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground font-mono">{student.student_code}</span>
              <Badge variant={STUDENT_STATUS[student.status].variant}>{tr(STUDENT_STATUS[student.status].label)}</Badge>
              {student.deleted_at && <Badge variant="destructive">{tr("Archived")}</Badge>}
            </div>
          </div>
        </div>
        {canEditStudent && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={studentEditPath(student.id)}>
                <PencilIcon aria-hidden /> {tr("Edit")}
              </Link>
            </Button>
            {student.deleted_at ? (
              <ConfirmActionButton
                title={tr("Restore student?")}
                description={tr("The student will reappear in lists and regain access for their teachers and parents.")}
                confirmLabel={tr("Restore")}
                successMessage={tr("Student restored.")}
                action={restoreStudentAction.bind(null, { studentId: student.id })}
              >
                <ArchiveRestoreIcon aria-hidden /> {tr("Restore")}
              </ConfirmActionButton>
            ) : (
              <ConfirmActionButton
                title={tr("Archive student?")}
                description={tr("Archived students are hidden from lists, teachers and parents. Their history is kept and they can be restored.")}
                confirmLabel={tr("Archive")}
                successMessage={tr("Student archived.")}
                destructive
                action={archiveStudentAction.bind(null, { studentId: student.id })}
              >
                <ArchiveIcon aria-hidden /> {tr("Archive")}
              </ConfirmActionButton>
            )}
          </div>
        )}
      </div>

      <TabNav
        label={tr("Student profile sections")}
        active={tab}
        tabs={STUDENT_TABS.map((t) => ({ value: t.value, label: t.label, href: studentPath(student.id, t.value) }))}
      />

      {tab === "overview" && (
        <StudentOverview
          student={student}
          canEditStudent={canEditStudent}
          canManageEnrollments={canManageEnrollments}
          parentOptions={parentOptions.map((p) => ({ id: p.id, label: p.phone ? `${p.full_name} · ${p.phone}` : p.full_name }))}
          classOptions={classChoices}
        />
      )}
      {tab === "progress" && (
        <StudentProgress student={student} canManageEnrollments={canManageEnrollments} classOptions={classChoices} />
      )}
      {tab === "feedback" && (
        <StudentFeedback
          studentId={student.id}
          feedback={feedback}
          canWrite={can(user.permissions, "feedback.write")}
          canModerateAll={can(user.permissions, "feedback.write", ["all"])}
          currentUserId={user.id}
        />
      )}
      {tab === "tuition" &&
        (tuition ? (
          <div className="grid gap-4">
            {canAssignTuition && (
              <div>
                <AssignTuitionDialog
                  fixedStudentId={student.id}
                  students={[]}
                  plans={tuitionPlans
                    .filter((p) => p.is_active)
                    .map((p) => ({ id: p.id, label: `${p.name} · ${formatVnd(p.amount)}`, amount: p.amount }))}
                  rules={tuitionRules
                    .filter((r) => r.is_active)
                    .map((r) => ({ id: r.id, label: r.name, planId: r.plan_id, kind: r.kind, value: r.value }))}
                />
              </div>
            )}
            <TuitionOverview
              {...tuition}
              staff={can(user.permissions, "tuition.read", ["all"]) ? { canCancel: canAssignTuition } : undefined}
            />
          </div>
        ) : (
          <EmptyState
            icon={LockIcon}
            title={tr("Financial information is restricted")}
            description={tr("Tuition is visible to finance staff, the student and their parents. Ask an administrator if you need access.")}
          />
        ))}
      {tab === "attendance" && (
        <StudentAttendance
          history={attendance}
          alerts={absenceAlerts}
          onlyTaughtClasses={!can(user.permissions, "attendance.read", ["all", "own", "children"])}
        />
      )}
      {tab === "assignments" && <StudentWorkTable rows={work} />}
      {tab === "tests" && <StudentTests tests={tests} studentId={student.id} />}
      {tab === "grades" &&
        (canSeeGrades ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              {tr("Published results of the last 12 months: returned grades, graded tests, reviewed work and practice.")}
              <Link href={analyticsStudentPath(student.id)} className="underline">
                {tr("Progress over time")}
              </Link>
            </p>
            <ResultsTable results={grades} />
          </div>
        ) : (
          <EmptyState icon={LockIcon} title={tr("Grades are not available to your role")} />
        ))}
      {tab === "materials" &&
        (materials.length === 0 ? (
          <EmptyState icon={FolderOpenIcon} title={tr("No materials")} description={tr("Nothing from the material library is assigned to this student's classes or shared with them.")} />
        ) : (
          <ul className="grid gap-2">
            {materials.map((m) => (
              <li key={m.id}>
                <Link href={libraryMaterialPath(m.id)} className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="font-medium">{m.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {FILE_KIND_LABELS[m.file_kind as FileKind] ?? m.file_kind} · {m.scope === "academy" ? tr("Academy library") : m.owner_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </>
  )
}
