import { BookOpenCheckIcon, MessageSquareIcon, UnlinkIcon, UsersRoundIcon } from "lucide-react"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ENROLLMENT_STATUS, GENDER_LABELS, RELATIONSHIP_LABELS } from "@/config/labels"
import { archiveFeedbackAction, unlinkParentAction } from "@/features/students/actions"
import { FeedbackForm } from "@/features/students/components/feedback-form"
import { EnrollDialog, EnrollmentActions } from "@/features/enrollments/components/enrollment-dialogs"
import { LinkParentDialog } from "@/features/students/components/student-dialogs"
import type { StudentProfile } from "@/features/students/server/student-service"
import { formatDate, formatDateRange } from "@/lib/format"
import { getT } from "@/i18n/server"

type Option = { id: string; label: string }

async function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const t = await getT()
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{t(label)}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  )
}

function levelText(level: { name: string; cefr: string | null } | null) {
  if (!level) return null
  return level.cefr && level.cefr !== level.name ? `${level.name} (≈ ${level.cefr})` : level.name
}

const CURRENT = new Set(["pending", "active"])

export async function StudentOverview({
  student,
  canEditStudent,
  canManageEnrollments,
  parentOptions,
  classOptions,
}: {
  student: StudentProfile
  canEditStudent: boolean
  canManageEnrollments: boolean
  parentOptions: Option[]
  classOptions: Option[]
}) {
  const t = await getT()
  const current = student.enrollments.filter((e) => CURRENT.has(e.status) && e.class)
  const parents = student.student_parents.filter((link) => link.parent)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("Student details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("Student ID")}>
              <span className="font-mono">{student.student_code}</span>
            </Detail>
            <Detail label={t("Full name")}>{student.full_name}</Detail>
            <Detail label={t("Date of birth")}>{formatDate(student.date_of_birth)}</Detail>
            <Detail label={t("Gender")}>{student.gender && GENDER_LABELS[student.gender]}</Detail>
            <Detail label={t("Phone")}>{student.phone}</Detail>
            <Detail label={t("Email")}>{student.email}</Detail>
            <Detail label={t("Address")}>{student.address}</Detail>
            <Detail label={t("School")}>{student.school_name}</Detail>
            <Detail label={t("Enrollment date")}>{formatDate(student.joined_on)}</Detail>
            <Detail label={t("Current class")}>{current.map((e) => e.class!.name).join(", ")}</Detail>
            <Detail label={t("English level")}>{levelText(student.english_level)}</Detail>
            <Detail label={t("Target level")}>{levelText(student.target_level)}</Detail>
            {/* Notes are staff-only; student_notes() returns null for everyone else. */}
            {(student.notes !== null || canEditStudent) && (
              <div className="sm:col-span-2">
                <Detail label={t("Internal notes")}>
                  {student.notes && <span className="whitespace-pre-line">{student.notes}</span>}
                </Detail>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("Parents")}</CardTitle>
            {canEditStudent && (
              <CardAction>
                <LinkParentDialog studentId={student.id} parents={parentOptions} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {parents.length === 0 ? (
              <EmptyState icon={UsersRoundIcon} title={t("No parents linked")} />
            ) : (
              <ul className="grid gap-3">
                {parents.map((link) => (
                  <li key={link.parent!.id} className="flex items-start justify-between gap-2">
                    <div className="grid text-sm">
                      <span className="font-medium">
                        {link.parent!.full_name}{" "}
                        {link.is_primary_contact && <Badge variant="secondary">{t("Primary")}</Badge>}
                      </span>
                      <span className="text-muted-foreground">
                        {t(RELATIONSHIP_LABELS[link.relationship])}
                        {link.parent!.phone && ` · ${link.parent!.phone}`}
                      </span>
                    </div>
                    {canEditStudent && (
                      <ConfirmActionButton
                        variant="ghost"
                        size="icon"
                        aria-label={t("Unlink {full_name}", { full_name: link.parent!.full_name })}
                        title={t("Unlink parent?")}
                        description={t("{full_name} will no longer be linked to {full_name2}.", { full_name: link.parent!.full_name, full_name2: student.full_name })}
                        confirmLabel={t("Unlink")}
                        successMessage={t("Parent unlinked.")}
                        destructive
                        action={unlinkParentAction.bind(null, { studentId: student.id, parentId: link.parent!.id })}
                      >
                        <UnlinkIcon aria-hidden />
                      </ConfirmActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Classes")}</CardTitle>
            <CardDescription>{t("Current enrolments")}</CardDescription>
            {canManageEnrollments && (
              <CardAction>
                <EnrollDialog studentId={student.id} classes={classOptions} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {current.length === 0 ? (
              <EmptyState icon={BookOpenCheckIcon} title={t("Not in a class")} />
            ) : (
              <ul className="grid gap-4">
                {current.map((enrollment) => (
                  <li key={enrollment.id} className="grid gap-2">
                    <div className="grid text-sm">
                      <span className="font-medium">{enrollment.class!.name}</span>
                      <span className="text-muted-foreground">
                        {t("{name} · since {date}", { name: enrollment.class!.course?.name, date: formatDate(enrollment.enrolled_on) })}
                      </span>
                    </div>
                    {canManageEnrollments ? (
                      <EnrollmentActions
                        enrollmentId={enrollment.id}
                        status={enrollment.status}
                        currentClassId={enrollment.class!.id}
                        classes={classOptions}
                      />
                    ) : (
                      <Badge variant={ENROLLMENT_STATUS[enrollment.status].variant}>
                        {t(ENROLLMENT_STATUS[enrollment.status].label)}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export async function StudentProgress({
  student,
  canManageEnrollments,
  classOptions,
}: {
  student: StudentProfile
  canManageEnrollments: boolean
  classOptions: Option[]
}) {
  const t = await getT()
  const history = [...student.enrollments].sort((a, b) => b.enrolled_on.localeCompare(a.enrolled_on))

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("English level")}</CardTitle>
          <CardDescription>{t("Current level and the level the student is working towards.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("Current")}>{levelText(student.english_level)}</Detail>
            <Detail label={t("Target")}>{levelText(student.target_level)}</Detail>
          </dl>
        </CardContent>
      </Card>
      <div className="grid gap-2">
        <h2 className="font-semibold">{t("Class history")}</h2>
        <SimpleTable
          rows={history}
          rowKey={(e) => e.id}
          empty={<EmptyState icon={BookOpenCheckIcon} title={t("No class history yet")} />}
          columns={[
            { header: "Class", cell: (e) => e.class?.name ?? "Class not visible to you" },
            { header: "Course", cell: (e) => e.class?.course?.name ?? "—" },
            { header: "Dates", cell: (e) => formatDateRange(e.enrolled_on, e.ended_on) },
            {
              header: "Status",
              cell: (e) =>
                canManageEnrollments ? (
                  <EnrollmentActions
                    enrollmentId={e.id}
                    status={e.status}
                    currentClassId={e.class?.id ?? null}
                    classes={classOptions}
                  />
                ) : (
                  <Badge variant={ENROLLMENT_STATUS[e.status].variant}>{t(ENROLLMENT_STATUS[e.status].label)}</Badge>
                ),
            },
          ]}
        />
      </div>
    </div>
  )
}

export async function StudentFeedback({
  studentId,
  feedback,
  canWrite,
  canModerateAll,
  currentUserId,
}: {
  studentId: string
  feedback: { id: string; author_profile_id: string | null; author_name: string; body: string; created_at: string }[]
  canWrite: boolean
  canModerateAll: boolean
  currentUserId: string
}) {
  const t = await getT()
  return (
    <div className="grid max-w-3xl gap-6">
      {canWrite && (
        <Card>
          <CardContent>
            <FeedbackForm studentId={studentId} />
          </CardContent>
        </Card>
      )}
      {feedback.length === 0 ? (
        <EmptyState
          icon={MessageSquareIcon}
          title={t("No feedback yet")}
          description={t("Teachers' notes about this student's progress will appear here.")}
        />
      ) : (
        <ul className="grid gap-3">
          {feedback.map((item) => (
            <li key={item.id}>
              <Card className="gap-3 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="text-sm">{item.author_name || t("Former staff member")}</CardTitle>
                  <CardDescription>{formatDate(item.created_at)}</CardDescription>
                  {(canModerateAll || (canWrite && item.author_profile_id === currentUserId)) && (
                    <CardAction>
                      <ConfirmActionButton
                        variant="ghost"
                        size="sm"
                        title={t("Remove feedback?")}
                        description={t("It will no longer be visible to the student, parents or teachers.")}
                        confirmLabel={t("Remove")}
                        successMessage={t("Feedback removed.")}
                        destructive
                        action={archiveFeedbackAction.bind(null, { feedbackId: item.id })}
                      >
                        {t("Remove")}
                      </ConfirmActionButton>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent className="px-4 text-sm whitespace-pre-line">{item.body}</CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
