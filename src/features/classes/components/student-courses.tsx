import { ArrowRightIcon, BookOpenIcon } from "lucide-react"
import Link from "next/link"

import { SubjectArt } from "@/components/brand/subject-art"
import { ProgressFill, Stagger, StaggerItem } from "@/components/motion/reveal"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips } from "@/components/shared/filter-chips"
import { Badge } from "@/components/ui/badge"
import { classPath, routes } from "@/config/routes"
import type { listClasses } from "@/features/classes/server/class-service"
import { courseProgress } from "@/features/dashboard/server/student-dashboard"
import { getT } from "@/i18n/server"
import { formatDateRange } from "@/lib/format"
import { publicMediaUrl } from "@/lib/public-media"

type ClassRow = Awaited<ReturnType<typeof listClasses>>[number]

/** A student's own classes as course cards, filterable by subject. */
export async function StudentCourses({ classes, subjectId, today }: { classes: ClassRow[]; subjectId?: string; today: string }) {
  const t = await getT()
  const subjects = [...new Map(classes.flatMap((c) => (c.course?.subject ? [[c.course.subject.id, c.course.subject.name] as const] : []))).entries()]
  const shown = subjectId ? classes.filter((c) => c.course?.subject?.id === subjectId) : classes

  return (
    <div className="grid gap-5">
      {subjects.length > 1 && (
        <FilterChips
          label={t("Filter by subject")}
          chips={[
            { href: routes.classes, label: t("All"), active: !subjectId },
            ...subjects.map(([id, name]) => ({ href: `${routes.classes}?subject=${id}`, label: name, active: subjectId === id })),
          ]}
        />
      )}
      {shown.length === 0 ? (
        <EmptyState icon={BookOpenIcon} title={t("You are not in a class yet")} description={t("The academy office will enrol you. Your classes will appear here.")} />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((klass) => {
            const subject = klass.course?.subject
            const lead = klass.class_members.find((m) => m.member_role === "lead_teacher")?.teacher?.full_name
            const progress = courseProgress(klass.start_date, klass.end_date, today)
            return (
              <StaggerItem key={klass.id}>
                <Link href={classPath(klass.id)} className="lift group bg-card flex h-full flex-col overflow-hidden rounded-xl border">
                  <SubjectArt icon={subject?.icon} imageUrl={publicMediaUrl(subject?.image_path)} className="aspect-[16/9]" />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {subject && <Badge variant="secondary">{subject.name}</Badge>}
                      {klass.course?.level?.name && <Badge variant="outline">{klass.course.level.name}</Badge>}
                    </div>
                    <h3 className="font-heading text-lg leading-snug font-semibold">{klass.course?.name ?? klass.name}</h3>
                    <p className="text-muted-foreground text-sm">
                      {t("Class")} {klass.name}
                      {lead ? ` · ${t("Teacher:")} ${lead}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatDateRange(klass.start_date, klass.end_date)}</p>
                    {progress !== null && (
                      <div className="mt-auto grid gap-1 pt-2">
                        <span className="text-muted-foreground flex justify-between text-xs">
                          {t("Course calendar")}
                          <span className="tabular-nums">{progress}%</span>
                        </span>
                        <span className="bg-muted block h-1.5 overflow-hidden rounded-full" aria-hidden>
                          <ProgressFill value={progress} className="bg-primary rounded-full" />
                        </span>
                      </div>
                    )}
                    <span className="text-primary mt-2 inline-flex items-center gap-1 text-sm font-medium">
                      {t("Go to class")}
                      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}
    </div>
  )
}

