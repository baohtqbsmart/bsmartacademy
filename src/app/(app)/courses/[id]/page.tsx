import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, ListTreeIcon, PencilIcon } from "lucide-react"
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
import { Card, CardContent } from "@/components/ui/card"
import { CLASS_STATUS, COURSE_STATUS } from "@/config/labels"
import { classPath, courseEditPath, routes } from "@/config/routes"
import { archiveCourseAction, restoreCourseAction } from "@/features/courses/actions"
import { UnitControls, UnitDialog, UnitLessonsDialog } from "@/features/courses/components/course-units"
import { getCourse } from "@/features/courses/server/course-service"
import { listLessons } from "@/features/english/server/lesson-service"
import { SKILL_LABELS } from "@/features/english/skills"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateRange } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Course") }
}

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.courseDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const course = await getCourse(db, id)
  if (!course) notFound()

  const canWrite = can(user.permissions, "courses.write")
  const lessons = canWrite ? await listLessons(db) : []
  const units = course.course_units
  const plannedSessions = units.reduce((sum, u) => sum + (u.session_count ?? 0), 0)
  // RLS limits the class list to classes the viewer may see.
  const classes = course.classes.filter((c) => !c.deleted_at)

  return (
    <>
      <Link href={routes.courses} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Courses")}
      </Link>
      <PageHeader
        title={course.name}
        description={[course.code, course.subject?.name, course.level?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge variant={COURSE_STATUS[course.status].variant}>{t(COURSE_STATUS[course.status].label)}</Badge>
            {course.deleted_at && <Badge variant="destructive">{t("Archived")}</Badge>}
            {canWrite && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={courseEditPath(course.id)}>
                    <PencilIcon aria-hidden /> {t("Edit")}
                  </Link>
                </Button>
                {course.deleted_at ? (
                  <ConfirmActionButton
                    title={t("Restore course?")}
                    description={t("The course returns to the catalogue.")}
                    confirmLabel={t("Restore")}
                    successMessage={t("Course restored.")}
                    action={restoreCourseAction.bind(null, { courseId: course.id })}
                  >
                    <ArchiveRestoreIcon aria-hidden /> {t("Restore")}
                  </ConfirmActionButton>
                ) : (
                  <ConfirmActionButton
                    title={t("Archive course?")}
                    description={t("Only possible when no planned or running class uses it.")}
                    confirmLabel={t("Archive")}
                    successMessage={t("Course archived.")}
                    destructive
                    action={archiveCourseAction.bind(null, { courseId: course.id })}
                  >
                    <ArchiveIcon aria-hidden /> {t("Archive")}
                  </ConfirmActionButton>
                )}
              </>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Stat label={t("Duration")} value={course.duration_weeks ? `${course.duration_weeks} weeks` : "—"} />
          <Stat label={t("Sessions")} value={course.session_count ? String(course.session_count) : "—"} />
          <Stat label={t("Session length")} value={course.session_minutes ? `${course.session_minutes} min` : "—"} />
          <Stat label={t("Units")} value={`${units.length} (${plannedSessions} sessions planned)`} />
          {course.description && <p className="text-sm whitespace-pre-line sm:col-span-4">{course.description}</p>}
        </CardContent>
      </Card>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{t("Course structure")}</h2>
            <p className="text-muted-foreground text-sm">{t("Shared by every class of this course.")}</p>
          </div>
          {canWrite && <UnitDialog courseId={course.id} />}
        </div>
        <SimpleTable
          rows={units}
          rowKey={(u) => u.id}
          empty={<EmptyState icon={ListTreeIcon} title={t("No units yet")} description={t("Add units to outline the syllabus.")} />}
          columns={[
            { header: "#", cell: (u) => units.indexOf(u) + 1, className: "w-10" },
            {
              header: "Unit",
              cell: (u) => (
                <div className="grid">
                  <span className="font-medium">{u.title}</span>
                  {u.description && <span className="text-muted-foreground text-xs whitespace-normal">{u.description}</span>}
                  {u.unit_lessons.length > 0 && (
                    <span className="text-muted-foreground mt-1 text-xs whitespace-normal">
                      {t("Lessons:")}{" "}
                      {[...u.unit_lessons]
                        .sort((a, b) => a.position - b.position)
                        .flatMap((ul) => (ul.lesson ? [ul.lesson.title] : []))
                        .join(" · ")}
                    </span>
                  )}
                </div>
              ),
            },
            { header: "Sessions", cell: (u) => u.session_count ?? "—" },
            ...(canWrite
              ? [
                  {
                    header: "",
                    key: "actions",
                    className: "text-right",
                    cell: (u: (typeof units)[number]) => (
                      <span className="inline-flex items-center">
                        <UnitLessonsDialog
                          unitId={u.id}
                          unitTitle={u.title}
                          lessons={lessons.map((l) => ({
                            id: l.id,
                            title: l.title,
                            hint: [t(SKILL_LABELS[l.skill]), l.status === "published" ? "" : t("draft")].filter(Boolean).join(" · "),
                          }))}
                          selected={[...u.unit_lessons].sort((a, b) => a.position - b.position).flatMap((ul) => (ul.lesson ? [ul.lesson.id] : []))}
                        />
                        <UnitControls
                          courseId={course.id}
                          unit={u}
                          isFirst={units.indexOf(u) === 0}
                          isLast={units.indexOf(u) === units.length - 1}
                        />
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("Classes")}</h2>
        <SimpleTable
          rows={classes}
          rowKey={(c) => c.id}
          empty={t("No classes you can see run this course.")}
          columns={[
            {
              header: "Class",
              cell: (c) => (
                <Link href={classPath(c.id)} className="font-medium hover:underline">
                  {c.name}
                </Link>
              ),
            },
            { header: "Dates", cell: (c) => formatDateRange(c.start_date, c.end_date) },
            {
              header: "Status",
              cell: (c) => <Badge variant={CLASS_STATUS[c.status].variant}>{t(CLASS_STATUS[c.status].label)}</Badge>,
            },
          ]}
        />
      </section>
    </>
  )
}

async function Stat({ label, value }: { label: string; value: string }) {
  const t = await getT()
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{t(label)}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
