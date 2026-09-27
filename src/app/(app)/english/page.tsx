import { ArrowLeftIcon, InboxIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { StatTiles } from "@/components/shared/stat-tiles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { englishStudentPath, lessonPath, lessonSubmissionPath, routes, wordSetPath } from "@/config/routes"
import { SkillChart } from "@/features/english/components/skill-chart"
import { listSubmissions } from "@/features/english/server/lesson-service"
import { listVisibleStudents, loadLearnerOverview, loadPerformance, type LearnerOverview } from "@/features/english/server/dashboard-service"
import { listSets } from "@/features/english/server/vocabulary-service"
import { ENGLISH_SKILLS, SKILL_LABELS, weakestSkill } from "@/features/english/skills"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { listTestClasses } from "@/features/tests/server/test-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("English") }
}

export default async function EnglishDashboardPage({ searchParams }: PageProps<"/english">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.english)
  const params = await searchParams
  const db = await createClient()

  // Students: their own dashboard.
  if (can(user.permissions, "english.practice", ["own"])) {
    const studentId = await getOwnStudentId(db, user.id)
    if (!studentId) return <PageHeader title={t("English")} description={t("Your account is not linked to a student record yet.")} />
    const [overview, sets] = await Promise.all([loadLearnerOverview(db, studentId), listSets(db)])
    return (
      <>
        <PageHeader title={t("My English")} description={t("Your progress in every skill, what to review and what to try next.")} />
        <LearnerDashboard overview={overview} sets={sets.filter((s) => s.status === "published")} canPractise />
      </>
    )
  }

  const requested = uuidParam(params, "student")

  // Parents: their children, one at a time.
  if (can(user.permissions, "english.results", ["children"])) {
    const children = await listVisibleStudents(db)
    const child = children.find((c) => c.id === requested) ?? children[0]
    if (!child) return <PageHeader title={t("English")} description={t("No children are linked to your account.")} />
    const overview = await loadLearnerOverview(db, child.id)
    return (
      <>
        <PageHeader title={t("{full_name}'s English", { full_name: child.full_name })} description={t("Progress by skill, recent practice and teacher feedback.")} />
        {children.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Button key={c.id} variant={c.id === child.id ? "default" : "outline"} size="sm" asChild>
                <Link href={englishStudentPath(c.id)}>{c.full_name}</Link>
              </Button>
            ))}
          </div>
        )}
        <LearnerDashboard overview={overview} sets={[]} canPractise={false} />
      </>
    )
  }

  // Staff: one student in detail...
  if (requested) {
    const students = await listVisibleStudents(db)
    const student = students.find((s) => s.id === requested)
    if (student) {
      const overview = await loadLearnerOverview(db, student.id)
      return (
        <>
          <Link href={routes.english} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
            <ArrowLeftIcon className="size-4" aria-hidden /> {t("English overview")}
          </Link>
          <PageHeader title={t("{full_name} · English", { full_name: student.full_name })} description={student.student_code} />
          <LearnerDashboard overview={overview} sets={[]} canPractise={false} />
        </>
      )
    }
  }

  // ...or the overview of the students they can see.
  const classId = uuidParam(params, "class")
  const [classes, students, queue] = await Promise.all([
    listTestClasses(db),
    listVisibleStudents(db, classId),
    can(user.permissions, "english.review") ? listSubmissions(db, { status: "submitted" }) : [],
  ])
  const performance = await loadPerformance(db, students.map((s) => s.id))
  const cell = new Map(performance.map((p) => [`${p.student_id}:${p.skill}`, p]))

  return (
    <>
      <PageHeader title={t("English")} description={t("Skills of the students you teach, and work waiting for your feedback.")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("Waiting for feedback")}</CardTitle>
          <CardDescription>{t("Speaking, writing and pronunciation work from your students, oldest first.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <EmptyState icon={InboxIcon} title={t("Nothing to review")} />
          ) : (
            <ul className="grid gap-2 text-sm">
              {[...queue].reverse().map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{s.student?.full_name}</span> · {s.lesson?.title}{" "}
                    <Badge variant="outline">{s.lesson ? SKILL_LABELS[s.lesson.skill] : ""}</Badge>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{formatDateTime(s.submitted_at)}</span>
                    <Button size="sm" asChild>
                      <Link href={lessonSubmissionPath(s.id)}>{t("Review")}</Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="font-semibold">{t("Skills by student")}</h2>
        <ListFilters
          basePath={routes.english}
          values={{ class: classId }}
          filters={[{ param: "class", allLabel: "All my students", options: classes.map((c) => ({ value: c.id, label: c.name })) }]}
        />
        <SimpleTable
          rows={students}
          rowKey={(s) => s.id}
          empty={t("No students.")}
          footer={<p className="text-muted-foreground text-sm">{t("Average percentage per skill; “—” means no activity yet.")}</p>}
          columns={[
            {
              header: "Student",
              cell: (s) => (
                <Link href={englishStudentPath(s.id)} className="font-medium hover:underline">
                  {s.full_name}
                </Link>
              ),
            },
            ...ENGLISH_SKILLS.map((skill) => ({
              header: SKILL_LABELS[skill],
              key: skill,
              cell: (s: { id: string }) => {
                const p = cell.get(`${s.id}:${skill}`)
                return p?.average_percent == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="tabular-nums" title={t("{activities} activities", { activities: p.activities })}>
                    {Math.round(Number(p.average_percent))}%
                  </span>
                )
              },
            })),
          ]}
        />
      </section>
    </>
  )
}

async function LearnerDashboard({
  overview,
  sets,
  canPractise,
}: {
  overview: LearnerOverview
  sets: { id: string; title: string; wordCount: number }[]
  canPractise: boolean
}) {
  const t = await getT()
  const weakest = weakestSkill(overview.profile)
  const suggestions = [...overview.nextLessons].sort((a, b) => Number(b.skill === weakest) - Number(a.skill === weakest)).slice(0, 6)
  const practised = overview.profile.filter((p) => p.average_percent !== null)
  const overall = practised.length ? practised.reduce((sum, p) => sum + p.average_percent!, 0) / practised.length / 100 : null

  return (
    <>
      <StatTiles
        tiles={[
          { label: "Overall", value: overall, kind: "percent", hint: `${practised.length} of 7 skills practised` },
          { label: "Words learning", value: overview.vocabulary.learning, kind: "count", hint: `${overview.vocabulary.mastered} learnt well` },
          { label: "Words to review today", value: overview.vocabulary.due, kind: "count", tone: "critical" },
          { label: "Waiting for feedback", value: overview.waitingForFeedback, kind: "count" },
          { label: "Lessons done", value: overview.activity.length === 0 ? 0 : overview.profile.filter((p) => p.skill !== "vocabulary").reduce((sum, p) => sum + p.activities, 0), kind: "count", hint: "Exercises and reviewed work" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Skills")}</CardTitle>
            <CardDescription>{t("Average score of vocabulary practice, exercises, reviewed work and returned assignments.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SkillChart
              data={overview.profile.map((p) => ({ skill: SKILL_LABELS[p.skill], average: p.average_percent, activities: p.activities }))}
            />
            <details>
              <summary className="text-muted-foreground cursor-pointer text-sm">{t("Show as table")}</summary>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1 font-normal">{t("Skill")}</th>
                    <th className="py-1 text-right font-normal">{t("Average")}</th>
                    <th className="py-1 text-right font-normal">{t("Activities")}</th>
                    <th className="py-1 text-right font-normal">{t("Last")}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {overview.profile.map((p) => (
                    <tr key={p.skill} className="border-t">
                      <td className="py-1">{t(SKILL_LABELS[p.skill])}</td>
                      <td className="py-1 text-right">{p.average_percent === null ? "—" : `${p.average_percent}%`}</td>
                      <td className="py-1 text-right">{p.activities}</td>
                      <td className="py-1 text-right">{formatDateTime(p.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Recent activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.activity.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("No activity yet.")}</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {overview.activity.map((a) => (
                  <li key={a.id} className="grid">
                    <span>
                      <Badge variant="outline" className="mr-1">
                        {t(SKILL_LABELS[a.skill])}
                      </Badge>
                      {a.href ? (
                        <Link href={a.href} className="font-medium hover:underline">
                          {a.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{a.title}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {a.detail} · {formatDateTime(a.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canPractise && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Try next")}</CardTitle>
              <CardDescription>{weakest ? t("Starting with your weakest skill: {value}.", { value: SKILL_LABELS[weakest] }) : t("Lessons you have not done yet.")}</CardDescription>
            </CardHeader>
            <CardContent>
              {suggestions.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("You have done every lesson. Well done!")}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {suggestions.map((l) => (
                    <li key={l.id}>
                      <Badge variant="outline" className="mr-1">
                        {t(SKILL_LABELS[l.skill])}
                      </Badge>
                      <Link href={lessonPath(l.id)} className="font-medium hover:underline">
                        {l.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Vocabulary")}</CardTitle>
              <CardDescription>{t("Words come back for review when you are about to forget them.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {sets.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link href={wordSetPath(s.id)} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">{t("{wordCount} words", { wordCount: s.wordCount })}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
