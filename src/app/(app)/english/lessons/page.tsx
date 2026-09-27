import { CheckIcon, NotebookTextIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { TabNav } from "@/components/shared/tab-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { lessonPath, routes } from "@/config/routes"
import { listLessons } from "@/features/english/server/lesson-service"
import { isWorkSkill, LESSON_SKILLS, RESPONSE_MODE_LABELS, SKILL_LABELS, STATUS_LABELS } from "@/features/english/skills"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { CEFR_LABELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("English lessons") }
}

export default async function LessonsPage({ searchParams }: PageProps<"/english/lessons">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.lessons)
  const skill = enumParam(await searchParams, "skill", LESSON_SKILLS)
  const db = await createClient()
  const canWrite = can(user.permissions, "english.write")

  const studentId = can(user.permissions, "english.practice", ["own"]) ? await getOwnStudentId(db, user.id) : null
  const [lessons, done] = await Promise.all([
    listLessons(db, { skill }),
    studentId
      ? Promise.all([
          db.from("lesson_attempts").select("lesson_id").eq("student_id", studentId),
          db.from("lesson_submissions").select("lesson_id").eq("student_id", studentId),
        ]).then(([a, s]) => new Set([...(a.data ?? []), ...(s.data ?? [])].map((r) => r.lesson_id)))
      : new Set<string>(),
  ])

  return (
    <>
      <PageHeader
        title={t("Lessons")}
        description={t("Grammar, reading, listening, speaking, writing and pronunciation.")}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={skill ? `${routes.lessonNew}?skill=${skill}` : routes.lessonNew}>
                <PlusIcon aria-hidden /> {t("New lesson")}
              </Link>
            </Button>
          )
        }
      />
      <TabNav
        label={t("Skills")}
        active={skill ?? "all"}
        tabs={[
          { value: "all", label: "All", href: routes.lessons },
          ...LESSON_SKILLS.map((s) => ({ value: s, label: SKILL_LABELS[s], href: `${routes.lessons}?skill=${s}` })),
        ]}
      />
      <SimpleTable
        rows={lessons}
        rowKey={(l) => l.id}
        empty={<EmptyState icon={NotebookTextIcon} title={t("No lessons yet")} />}
        columns={[
          {
            header: "Lesson",
            cell: (l) => (
              <div className="grid">
                <Link href={lessonPath(l.id)} className="font-medium hover:underline">
                  {l.title}
                </Link>
                {l.summary && <span className="text-muted-foreground text-xs whitespace-normal">{l.summary}</span>}
              </div>
            ),
          },
          { header: "Skill", cell: (l) => <Badge variant="outline">{t(SKILL_LABELS[l.skill])}</Badge> },
          { header: "Level", cell: (l) => (l.cefr_level ? CEFR_LABELS[l.cefr_level] : "—") },
          { header: "Topic", cell: (l) => l.topic ?? "—" },
          {
            header: "Activity",
            cell: (l) =>
              isWorkSkill(l.skill) ? (l.response_mode ? RESPONSE_MODE_LABELS[l.response_mode] : "—") : `${l.exerciseCount} exercises`,
          },
          studentId
            ? {
                header: "Done",
                cell: (l) =>
                  done.has(l.id) ? (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <CheckIcon className="size-4" aria-hidden /> {t("Done")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">{t("Not yet")}</span>
                  ),
              }
            : { header: "Status", cell: (l) => (canWrite ? STATUS_LABELS[l.status] : "—") },
        ]}
      />
    </>
  )
}
