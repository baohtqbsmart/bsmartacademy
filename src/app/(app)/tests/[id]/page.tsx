import { ArrowLeftIcon, ClockIcon, PencilIcon, PlayIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { StatTiles } from "@/components/shared/stat-tiles"
import { TabNav } from "@/components/shared/tab-nav"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes, testAttemptPath, testEditPath, testPath, testTakePath } from "@/config/routes"
import { listBankQuestions } from "@/features/question-bank/server/bank-service"
import { closeExpiredAttemptsAction, startTestAction } from "@/features/tests/actions"
import { QuestionPreview } from "@/features/tests/components/question-preview"
import { ScoreDistributionChart } from "@/features/tests/components/score-chart"
import { QuestionPicker, TestLifecycle, TestQuestionControls } from "@/features/tests/components/test-builder"
import { AttemptStatusText, TestStatusBadge } from "@/features/tests/components/test-status-badge"
import {
  bestAttempts,
  QUESTION_TYPE_LABELS,
  REVIEW_POLICY_LABELS,
  scoreDistribution,
  summarizeScores,
} from "@/features/tests/questions"
import {
  getTest,
  listAttempts,
  listClassStudents,
  listTestKeys,
  listTestQuestions,
  loadQuestionStats,
  type AttemptRow,
  type TestDetail,
} from "@/features/tests/server/test-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Test") }
}

const VIEWS = ["questions", "results", "analytics"] as const

export default async function TestPage({ params, searchParams }: PageProps<"/tests/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.testDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const test = await getTest(db, id)
  if (!test) notFound()

  // Editors (and academy-wide readers) get the builder and results; students
  // and parents their own / their children's attempts.
  const isEditor = can(user.permissions, "tests.write")
  const isStaff = isEditor || can(user.permissions, "tests.read", ["all", "assigned"])
  const view = enumParam(await searchParams, "view", VIEWS) ?? "questions"

  return (
    <>
      <Link href={routes.tests} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Tests")}
      </Link>
      <PageHeader
        title={test.title}
        description={[test.class?.name, test.class?.course?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            <TestStatusBadge status={test.status} />
            {isEditor && test.status !== "archived" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={testEditPath(test.id)}>
                  <PencilIcon aria-hidden /> {t("Settings")}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Settings test={test} />

      {isStaff ? (
        <>
          <TabNav
            label={t("Test sections")}
            active={view}
            tabs={[
              { value: "questions", label: "Questions", href: testPath(test.id) },
              { value: "results", label: "Results", href: testPath(test.id, "results") },
              { value: "analytics", label: "Analytics", href: testPath(test.id, "analytics") },
            ]}
          />
          {view === "questions" && <QuestionsView test={test} isEditor={isEditor} />}
          {view === "results" && <ResultsView test={test} isEditor={isEditor} />}
          {view === "analytics" && <AnalyticsView test={test} />}
        </>
      ) : (
        <FamilyView test={test} isStudent={can(user.permissions, "test_attempts.write", ["own"])} />
      )}
    </>
  )
}

async function Settings({ test }: { test: TestDetail }) {
  const t = await getT()
  const items = [
    ["Opens", formatDateTime(test.available_from)],
    ["Closes", formatDateTime(test.available_until)],
    ["Time limit", test.time_limit_minutes ? `${test.time_limit_minutes} minutes` : "None"],
    ["Attempts", String(test.max_attempts)],
    ["Total score", String(Number(test.total_score))],
    ["Order", [test.shuffle_questions && "questions shuffled", test.shuffle_options && "options shuffled"].filter(Boolean).join(", ") || "Fixed"],
    ["Answers shown", REVIEW_POLICY_LABELS[test.review_policy]],
    ["Set by", test.created_by_name || "—"],
  ]
  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <span className="text-muted-foreground text-xs">{t(label)}</span>
            <span className="text-sm">{value}</span>
          </div>
        ))}
        {test.instructions && <p className="text-sm whitespace-pre-wrap sm:col-span-4">{test.instructions}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

async function QuestionsView({ test, isEditor }: { test: TestDetail; isEditor: boolean }) {
  const t = await getT()
  const db = await createClient()
  const questions = await listTestQuestions(db, test.id)
  const [keys, bank] = await Promise.all([
    listTestKeys(db, questions.map((q) => q.id)),
    isEditor && test.status === "draft" ? listBankQuestions(db) : [],
  ])
  const draft = isEditor && test.status === "draft"
  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points), 0)

  return (
    <>
      {isEditor && (
        <TestLifecycle testId={test.id} status={test.status} hasQuestions={questions.length > 0} canDelete={test.status === "draft" && !test.published_at} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("{length} question{value} · {totalPoints} points → scaled to {number}", { length: questions.length, value: questions.length === 1 ? "" : "s", totalPoints, number: Number(test.total_score) })}
          </CardTitle>
          <CardDescription>
            {draft
              ? t("Questions are copies from the bank; they freeze when the test is published.")
              : t("The test is published: its questions no longer change.")}
          </CardDescription>
          {draft && (
            <CardAction>
              <QuestionPicker
                target={{ kind: "test", testId: test.id }}
                alreadyAdded={questions.flatMap((q) => (q.source_question_id ? [q.source_question_id] : []))}
                questions={bank.map((q) => ({
                  id: q.id,
                  prompt: q.prompt,
                  question_type: q.question_type,
                  difficulty: q.difficulty,
                  cefr_level: q.cefr_level,
                  topic: q.topic,
                  tags: q.tags,
                  subject: q.subject?.name ?? null,
                  points: Number(q.points),
                }))}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("No questions yet.")}</p>
          ) : (
            <ol className="grid gap-4">
              {questions.map((q, index) => (
                <li key={q.id} className="flex items-start justify-between gap-3 border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex gap-2">
                    <span className="font-medium tabular-nums">{index + 1}.</span>
                    <QuestionPreview
                      type={q.question_type}
                      prompt={q.prompt}
                      content={q.content}
                      points={q.points}
                      answerKey={keys.get(q.id)?.answer as never}
                      explanation={keys.get(q.id)?.explanation}
                      mediaUrl={q.mediaUrl}
                    />
                  </div>
                  {draft && (
                    <TestQuestionControls testQuestionId={q.id} points={Number(q.points)} first={index === 0} last={index === questions.length - 1} />
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  )
}

async function ResultsView({ test, isEditor }: { test: TestDetail; isEditor: boolean }) {
  const t = await getT()
  const db = await createClient()
  const [attempts, students] = await Promise.all([listAttempts(db, test.id), test.class ? listClassStudents(db, test.class.id) : []])
  const byStudent = new Map<string, AttemptRow[]>()
  for (const a of attempts) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a])
  const expired = attempts.filter((a) => a.status === "in_progress" && a.deadline_at && new Date(a.deadline_at) < new Date()).length
  const rows = students.map((s) => ({ student: s, attempts: byStudent.get(s.id) ?? [] }))

  return (
    <section className="grid gap-3">
      {isEditor && expired > 0 && (
        <div>
          <ConfirmActionButton
            title={t("Hand in {expired} expired attempt{value}?", { expired, value: expired === 1 ? "" : "s" })}
            description={t("These students ran out of time without submitting; their saved answers are marked.")}
            confirmLabel={t("Hand in")}
            successMessage={t("Expired attempts handed in.")}
            action={closeExpiredAttemptsAction.bind(null, { testId: test.id })}
          >
            <ClockIcon aria-hidden /> {t("Hand in expired attempts ({expired})", { expired })}
          </ConfirmActionButton>
        </div>
      )}
      <SimpleTable
        rows={rows}
        rowKey={(r) => r.student.id}
        empty={<EmptyState icon={UsersIcon} title={t("No students in this class")} />}
        columns={[
          { header: "Student", cell: (r) => <span className="font-medium">{r.student.full_name}</span> },
          { header: "Attempts", cell: (r) => <span className="tabular-nums">{`${r.attempts.length} / ${test.max_attempts}`}</span> },
          {
            header: "Best",
            cell: (r) => {
              const best = bestAttempts(r.attempts)[0]
              return best ? <span className="tabular-nums">{`${Number(best.score)} / ${Number(test.total_score)}`}</span> : "—"
            },
          },
          {
            header: "Attempts (newest first)",
            key: "attempts",
            cell: (r) =>
              r.attempts.length === 0 ? (
                <span className="text-muted-foreground">{t("Not attempted")}</span>
              ) : (
                <ul className="grid gap-0.5">
                  {r.attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                      <Link href={testAttemptPath(test.id, a.id)} className="hover:underline">
                        #{a.attempt_number}
                      </Link>
                      <AttemptStatusText status={a.status} score={a.score} total={test.total_score} />
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {a.submitted_at ? formatDateTime(a.submitted_at) : t("started {dateTime}", { dateTime: formatDateTime(a.started_at) })}
                        {a.auto_submitted && t(" · handed in automatically")}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </section>
  )
}

async function AnalyticsView({ test }: { test: TestDetail }) {
  const t = await getT()
  const db = await createClient()
  const [attempts, stats, students] = await Promise.all([
    listAttempts(db, test.id),
    loadQuestionStats(db, test.id),
    test.class ? listClassStudents(db, test.class.id) : [],
  ])
  const total = Number(test.total_score)
  const best = bestAttempts(attempts).map((a) => Number(a.score))
  const summary = summarizeScores(best)
  const attempted = new Set(attempts.map((a) => a.student_id)).size
  const toMark = attempts.filter((a) => a.status === "submitted").length
  const bands = scoreDistribution(best, total)
  const share = (value: number | null) => (value === null || total === 0 ? null : value / total)

  return (
    <div className="grid gap-6">
      <StatTiles
        tiles={[
          { label: "Students attempted", value: attempted, kind: "count", hint: `of ${students.length} in the class · ${attempts.length} attempts` },
          { label: "Average (best attempt)", value: share(summary.average), kind: "percent", hint: summary.average === null ? "No graded attempts" : `${summary.average} / ${total}` },
          { label: "Median", value: share(summary.median), kind: "percent", hint: summary.median === null ? undefined : `${summary.median} / ${total}` },
          { label: "Highest · lowest", value: share(summary.highest), kind: "percent", hint: summary.lowest === null ? undefined : `lowest ${Math.round((summary.lowest / total) * 100)}%` },
          { label: "Waiting for marking", value: toMark, kind: "count", tone: "critical", hint: "Attempts with open questions" },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("Score distribution")}</CardTitle>
          <CardDescription>{t("Students by their best fully marked attempt, as a share of the total score.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ScoreDistributionChart data={bands} />
          <details>
            <summary className="text-muted-foreground cursor-pointer text-sm">{t("Show as table")}</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 font-normal">{t("Score")}</th>
                  <th className="py-1 text-right font-normal">{t("Students")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {bands.map((b) => (
                  <tr key={b.label} className="border-t">
                    <td className="py-1">{t(b.label)}</td>
                    <td className="py-1 text-right">{b.students}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>
      <section className="grid gap-2">
        <h2 className="font-semibold">{t("By question")}</h2>
        <p className="text-muted-foreground text-sm">{t("Average mark over handed-in attempts. Low averages point to hard or unclear questions.")}</p>
        <SimpleTable
          rows={stats}
          rowKey={(s) => s.test_question_id}
          empty={t("No questions.")}
          columns={[
            { header: "#", cell: (s) => <span className="tabular-nums">{s.question_position}</span> },
            { header: "Question", cell: (s) => <span className="line-clamp-2 max-w-sm whitespace-normal">{s.prompt}</span> },
            { header: "Type", cell: (s) => QUESTION_TYPE_LABELS[s.question_type] },
            {
              header: "Average",
              cell: (s) =>
                s.average_score === null ? (
                  "—"
                ) : (
                  <span className="tabular-nums">{`${Math.round((s.average_score / s.points) * 100)}% (${s.average_score} / ${s.points})`}</span>
                ),
            },
            { header: "Full marks", cell: (s) => <span className="tabular-nums">{t("{full_marks} of {attempts}", { full_marks: s.full_marks, attempts: s.attempts })}</span> },
            { header: "Left blank", cell: (s) => <span className="tabular-nums">{s.attempts - s.answered}</span> },
            { header: "To mark", cell: (s) => <span className="tabular-nums">{s.awaiting_review || "—"}</span> },
          ]}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

async function FamilyView({ test, isStudent }: { test: TestDetail; isStudent: boolean }) {
  const t = await getT()
  const attempts = await listAttempts(await createClient(), test.id)
  const open = attempts.find((a) => a.status === "in_progress")
  const now = new Date()
  const notYet = test.available_from !== null && new Date(test.available_from) > now
  const over = test.status !== "published" || (test.available_until !== null && new Date(test.available_until) <= now)
  const mine = attempts.length

  let action: React.ReactNode = null
  if (isStudent) {
    if (open) {
      action = (
        <Button asChild>
          <Link href={testTakePath(test.id)}>
            <PlayIcon aria-hidden /> {t("Continue attempt {attempt_number}", { attempt_number: open.attempt_number })}
          </Link>
        </Button>
      )
    } else if (over) {
      action = <p className="text-muted-foreground text-sm">{t("This test is closed.")}</p>
    } else if (notYet) {
      action = <p className="text-muted-foreground text-sm">{t("Opens {dateTime}.", { dateTime: formatDateTime(test.available_from) })}</p>
    } else if (mine >= test.max_attempts) {
      action = <p className="text-muted-foreground text-sm">{t("You have used all your attempts.")}</p>
    } else {
      action = (
        <ConfirmActionButton
          variant="default"
          title={mine === 0 ? t("Start the test?") : t("Start attempt {value}?", { value: mine + 1 })}
          description={
            test.time_limit_minutes
              ? t("You will have {time_limit_minutes} minutes. The timer keeps running if you leave the page.", { time_limit_minutes: test.time_limit_minutes })
              : t("Your answers are saved as you go; submit when you are done.")
          }
          confirmLabel={t("Start")}
          successMessage={t("Good luck!")}
          action={startTestAction.bind(null, { testId: test.id })}
        >
          <PlayIcon aria-hidden /> {mine === 0 ? t("Start test") : t("Start a new attempt")}
        </ConfirmActionButton>
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isStudent ? t("Your attempts") : t("Attempts")}</CardTitle>
        <CardDescription>
          {isStudent && t("{mine} of {max_attempts} used. ", { mine, max_attempts: test.max_attempts })}
          {t("Answers and marks per question are shown {value}.", { value: REVIEW_POLICY_LABELS[test.review_policy].toLowerCase() })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {action && <div>{action}</div>}
        {attempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("No attempts yet.")}</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                {!isStudent && <span className="font-medium">{a.student?.full_name}</span>}
                {a.status === "in_progress" ? (
                  <span>{t("Attempt {attempt_number}", { attempt_number: a.attempt_number })}</span>
                ) : (
                  <Link href={testAttemptPath(test.id, a.id)} className="hover:underline">
                    {t("Attempt {attempt_number}", { attempt_number: a.attempt_number })}
                  </Link>
                )}
                <AttemptStatusText status={a.status} score={a.score} total={test.total_score} />
                {a.submitted_at && <span className="text-muted-foreground tabular-nums">{formatDateTime(a.submitted_at)}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
