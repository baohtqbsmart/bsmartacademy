import { ArrowLeftIcon, PencilIcon, SendIcon, UsersIcon } from "lucide-react"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assessmentEditPath, assessmentSubmissionPath, routes } from "@/config/routes"
import { returnGradesAction } from "@/features/assessments/actions"
import { SubmitForm } from "@/features/assessments/components/submit-form"
import { TaskControls } from "@/features/assessments/components/task-controls"
import { getTask, listTaskSubmissions, type SubmissionRow, type Task } from "@/features/assessments/server/assessment-service"
import { IELTS_NOTICE, KIND_LABELS, RESPONSE_LABELS } from "@/features/assessments/scoring"
import { listVisibleStudents } from "@/features/english/server/dashboard-service"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { CEFR_LABELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Writing or speaking task") }
}

export default async function TaskPage({ params }: PageProps<"/assessments/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.assessmentDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const task = await getTask(db, id)
  if (!task) notFound()

  const canWrite = can(user.permissions, "assessments.write")
  const studentId = can(user.permissions, "assessments.submit", ["own"]) ? await getOwnStudentId(db, user.id) : null

  return (
    <>
      <Link href={routes.assessments} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Writing & speaking")}
      </Link>
      <PageHeader
        title={task.title}
        description={[task.class?.name, task.cefr_level && CEFR_LABELS[task.cefr_level]].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge variant="outline">{t(KIND_LABELS[task.kind])}</Badge>
            {task.closed_at && <Badge variant="outline">{t("Closed")}</Badge>}
            {canWrite && task.status !== "archived" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={assessmentEditPath(task.id)}>
                  <PencilIcon aria-hidden /> {t("Edit")}
                </Link>
              </Button>
            )}
          </>
        }
      />
      {canWrite && <TaskControls taskId={task.id} status={task.status} closed={Boolean(task.closed_at)} publishedBefore={Boolean(task.published_at)} />}

      <TaskDetails task={task} />

      {canWrite ? <Roster task={task} /> : studentId ? <StudentPanel task={task} studentId={studentId} /> : <FamilyPanel task={task} />}
    </>
  )
}

async function TaskDetails({ task }: { task: Task }) {
  const t = await getT()
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle>{task.kind === "writing" ? t("Task") : t("Prompt")}</CardTitle>
          <CardDescription>
            {t(RESPONSE_LABELS[task.response_mode])}
            {task.min_words && t(" · at least {min_words} words", { min_words: task.min_words })}
            {task.max_words && t(" · at most {max_words} words", { max_words: task.max_words })}
            {task.max_duration_seconds && t(" · about {value} min", { value: Math.round(task.max_duration_seconds / 60) || 1 })}
            {task.due_at && t(" · due {dateTime}", { dateTime: formatDateTime(task.due_at) })}
            {t(" · {max_attempts} attempt{value}", { max_attempts: task.max_attempts, value: task.max_attempts === 1 ? "" : "s" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {task.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={task.mediaUrl} alt="" className="max-h-80 rounded-md border" />
          )}
          <p className="text-base whitespace-pre-wrap">{task.task}</p>
          {task.instructions && <p className="text-muted-foreground text-sm whitespace-pre-wrap">{task.instructions}</p>}
        </CardContent>
      </Card>
      <Card className="content-start">
        <CardHeader>
          <CardTitle>{t("How it is marked")}</CardTitle>
          <CardDescription>{task.scoring === "ielts_band" ? IELTS_NOTICE : t("Out of {number} points.", { number: Number(task.max_score) })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {task.criteriaList.map((c) => (
              <li key={c.name} className="grid">
                <span className="flex justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums">{task.scoring === "ielts_band" ? t("band 0–9") : t("{max_points} pts", { max_points: c.max_points })}</span>
                </span>
                {c.description && <span className="text-muted-foreground">{c.description}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function statusLabel(s: SubmissionRow, family: boolean) {
  if (s.status === "returned") return "Feedback returned"
  if (s.status === "graded") return family ? "Handed in" : "Graded (not returned)"
  return "Handed in"
}

async function Roster({ task }: { task: Task }) {
  const t = await getT()
  const db = await createClient()
  const [submissions, students] = await Promise.all([listTaskSubmissions(db, task.id), listVisibleStudents(db, task.class_id)])
  const latest = new Map<string, SubmissionRow>()
  for (const s of submissions) if (!latest.has(s.student_id) || latest.get(s.student_id)!.attempt < s.attempt) latest.set(s.student_id, s)
  const graded = [...latest.values()].filter((s) => s.status === "graded").length

  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("Students' work")}</h2>
        {graded > 0 && (
          <ConfirmActionButton
            title={t("Return {graded} grade{value}?", { graded, value: graded === 1 ? "" : "s" })}
            description={t("Students and parents will see the scores, feedback and comments.")}
            confirmLabel={t("Return")}
            successMessage={t("Grades returned.")}
            action={returnGradesAction.bind(null, { taskId: task.id })}
          >
            <SendIcon aria-hidden /> {t("Return all graded ({graded})", { graded })}
          </ConfirmActionButton>
        )}
      </div>
      <SimpleTable
        rows={students}
        rowKey={(s) => s.id}
        empty={<EmptyState icon={UsersIcon} title={t("No students in this class")} />}
        columns={[
          { header: "Student", cell: (s) => <span className="font-medium">{s.full_name}</span> },
          {
            header: "Status",
            cell: (s) => {
              const w = latest.get(s.id)
              return w ? (
                <span>
                  {t(statusLabel(w, false))}
                  {w.is_late && <Badge variant="outline" className="ml-1">{t("Late")}</Badge>}
                  {w.resubmission_allowed && <Badge variant="outline" className="ml-1">{t("May resubmit")}</Badge>}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("Not handed in")}</span>
              )
            },
          },
          { header: "Attempt", cell: (s) => latest.get(s.id)?.attempt ?? "—" },
          { header: "Handed in", cell: (s) => <span className="tabular-nums">{formatDateTime(latest.get(s.id)?.submitted_at)}</span> },
          {
            header: "Score",
            cell: (s) => {
              const g = latest.get(s.id)?.assessment_grades
              return g ? <span className="tabular-nums">{`${Number(g.total_score)} / ${Number(task.max_score)}`}</span> : "—"
            },
          },
          {
            header: "",
            key: "open",
            cell: (s) => {
              const w = latest.get(s.id)
              return w ? (
                <Button size="sm" variant={w.status === "submitted" ? "default" : "outline"} asChild>
                  <Link href={assessmentSubmissionPath(w.id)}>{w.status === "submitted" ? t("Grade") : t("Open")}</Link>
                </Button>
              ) : null
            },
          },
        ]}
      />
    </section>
  )
}

async function StudentPanel({ task, studentId }: { task: Task; studentId: string }) {
  const t = await getT()
  const submissions = await listTaskSubmissions(await createClient(), task.id, studentId)
  const latest = submissions[0]
  const attemptsLeft = task.max_attempts - submissions.length
  const lateBlocked = !task.allow_late && task.due_at !== null && new Date(task.due_at) < new Date()
  const canSubmit = task.status === "published" && !task.closed_at && !lateBlocked && (attemptsLeft > 0 || Boolean(latest?.resubmission_allowed))

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{submissions.length === 0 ? t("Your answer") : t("Hand in again")}</CardTitle>
          <CardDescription>
            {canSubmit
              ? submissions.length === 0
                ? "You can hand in once" + (task.max_attempts > 1 ? t(" (up to {max_attempts} attempts).", { max_attempts: task.max_attempts }) : ".")
                : latest?.resubmission_allowed
                  ? t("Your teacher has allowed you to resubmit.")
                  : t("{attemptsLeft} attempt{value} left.", { attemptsLeft, value: attemptsLeft === 1 ? "" : "s" })
              : task.closed_at
                ? t("This task is closed.")
                : lateBlocked
                  ? t("The due date has passed and late work is not accepted.")
                  : t("You have handed this in. Your teacher will return your feedback.")}
          </CardDescription>
        </CardHeader>
        {canSubmit && (
          <CardContent>
            <SubmitForm
              taskId={task.id}
              studentId={studentId}
              mode={task.response_mode}
              minWords={task.min_words}
              maxWords={task.max_words}
              maxSeconds={task.max_duration_seconds}
              previousText={latest?.text_response}
            />
          </CardContent>
        )}
      </Card>
      <Attempts submissions={submissions} maxScore={Number(task.max_score)} family />
    </>
  )
}

async function FamilyPanel({ task }: { task: Task }) {
  const submissions = await listTaskSubmissions(await createClient(), task.id)
  return <Attempts submissions={submissions} maxScore={Number(task.max_score)} family showStudent />
}

async function Attempts({ submissions, maxScore, family, showStudent = false }: { submissions: SubmissionRow[]; maxScore: number; family: boolean; showStudent?: boolean }) {
  const t = await getT()
  if (submissions.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Attempts")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {submissions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              {showStudent && <span className="font-medium">{s.student?.full_name}</span>}
              <Link href={assessmentSubmissionPath(s.id)} className="hover:underline">
                {t("Attempt {attempt}", { attempt: s.attempt })}
              </Link>
              <span className="text-muted-foreground tabular-nums">{formatDateTime(s.submitted_at)}</span>
              <span>{t(statusLabel(s, family))}</span>
              {s.assessment_grades && <span className="font-medium tabular-nums">{`${Number(s.assessment_grades.total_score)} / ${maxScore}`}</span>}
              {s.is_late && <Badge variant="outline">{t("Late")}</Badge>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
