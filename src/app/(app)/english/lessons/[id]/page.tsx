import { ArchiveIcon, ArrowLeftIcon, CircleCheckIcon, CircleXIcon, EyeOffIcon, PencilIcon, SendIcon, Trash2Icon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { lessonEditPath, lessonPath, lessonSubmissionPath, routes } from "@/config/routes"
import { removeLessonQuestionAction, setLessonStatusAction } from "@/features/english/actions"
import { ContentMediaUpload } from "@/features/english/components/media"
import { LessonExercises, WorkSubmission } from "@/features/english/components/lesson-work"
import {
  getAttemptReview,
  getLesson,
  listLessonAttempts,
  listLessonKeys,
  listSubmissions,
  type Lesson,
} from "@/features/english/server/lesson-service"
import { isWorkSkill, PART_OF_SPEECH_LABELS, RESPONSE_MODE_LABELS, SKILL_LABELS, STATUS_LABELS } from "@/features/english/skills"
import { listBankQuestions } from "@/features/question-bank/server/bank-service"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { QuestionPreview } from "@/features/tests/components/question-preview"
import { QuestionPicker } from "@/features/tests/components/test-builder"
import { asContent, asKey, asResponse, CEFR_LABELS, describeKey, describeResponse, isAutoGraded, isSometimesAuto } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { LessonPublishCard } from "@/features/site/components/publish-card"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Lesson") }
}

export default async function LessonPage({ params, searchParams }: PageProps<"/english/lessons/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.lessonDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const lesson = await getLesson(db, id)
  if (!lesson) notFound()

  const canEdit = can(user.permissions, "english.write", ["all"]) || (can(user.permissions, "english.write") && lesson.created_by === user.id)
  const studentId = can(user.permissions, "english.practice", ["own"]) ? await getOwnStudentId(db, user.id) : null
  const work = isWorkSkill(lesson.skill)
  const attemptId = uuidParam(await searchParams, "attempt")

  return (
    <>
      <Link href={`${routes.lessons}?skill=${lesson.skill}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("{value} lessons", { value: SKILL_LABELS[lesson.skill] })}
      </Link>
      <PageHeader
        title={lesson.title}
        description={lesson.summary ?? undefined}
        actions={
          <>
            <Badge variant="outline">{t(SKILL_LABELS[lesson.skill])}</Badge>
            {lesson.cefr_level && <Badge variant="secondary">{t(CEFR_LABELS[lesson.cefr_level])}</Badge>}
            {lesson.status !== "published" && <Badge variant="outline">{t(STATUS_LABELS[lesson.status])}</Badge>}
          </>
        }
      />
      {canEdit && <EditorBar lesson={lesson} />}
      {can(user.permissions, "site.write") && (
        <LessonPublishCard
          lessonId={lesson.id}
          title={lesson.title}
          published={lesson.status === "published"}
          initialAccess={lesson.public_access}
          initialSlug={lesson.slug}
        />
      )}

      <LessonContent lesson={lesson} />

      {!work && (lesson.questions.length > 0 || canEdit) && (
        <Exercises lesson={lesson} canEdit={canEdit} studentId={studentId} attemptId={attemptId} />
      )}
      {work && <WorkSection lesson={lesson} studentId={studentId} />}
      {!studentId && can(user.permissions, "english.results", ["all", "assigned", "children"]) && <Results lesson={lesson} />}
    </>
  )
}

async function EditorBar({ lesson }: { lesson: Lesson }) {
  const t = await getT()
  return (
    <div className="flex flex-wrap gap-2">
      {lesson.status !== "archived" && (
        <Button variant="outline" size="sm" asChild>
          <Link href={lessonEditPath(lesson.id)}>
            <PencilIcon aria-hidden /> {t("Edit")}
          </Link>
        </Button>
      )}
      {lesson.status === "published" ? (
        <ConfirmActionButton size="sm" title={t("Unpublish the lesson?")} description={t("Students no longer see it; their work is kept.")} confirmLabel={t("Unpublish")} successMessage={t("Lesson unpublished.")} action={setLessonStatusAction.bind(null, { lessonId: lesson.id, status: "draft" })}>
          <EyeOffIcon aria-hidden /> {t("Unpublish")}
        </ConfirmActionButton>
      ) : (
        <ConfirmActionButton size="sm" variant="default" title={t("Publish the lesson?")} description={t("Every student can open it.")} confirmLabel={t("Publish")} successMessage={t("Lesson published.")} action={setLessonStatusAction.bind(null, { lessonId: lesson.id, status: "published" })}>
          <SendIcon aria-hidden /> {t("Publish")}
        </ConfirmActionButton>
      )}
      {lesson.status !== "archived" && (
        <ConfirmActionButton size="sm" title={t("Archive the lesson?")} description={t("It leaves the library; students' work is kept.")} confirmLabel={t("Archive")} successMessage={t("Lesson archived.")} action={setLessonStatusAction.bind(null, { lessonId: lesson.id, status: "archived" })}>
          <ArchiveIcon aria-hidden /> {t("Archive")}
        </ConfirmActionButton>
      )}
      {lesson.status !== "archived" && (
        <ContentMediaUpload
          target={{ kind: "lesson", lessonId: lesson.id }}
          accept={lesson.skill === "listening" ? ".mp3,.m4a,.wav,.webm" : ".mp3,.m4a,.wav,.webm,.png,.jpg,.jpeg,.webp,.mp4"}
          label={lesson.media_path ? t("Replace media") : lesson.skill === "listening" ? t("Upload audio") : t("Add media")}
        />
      )}
    </div>
  )
}

async function LessonContent({ lesson }: { lesson: Lesson }) {
  const t = await getT()
  const media = lesson.mediaUrl
    ? /\.(mp3|m4a|wav|webm)$/i.test(lesson.media_path ?? "")
      ? <audio controls src={lesson.mediaUrl} className="w-full max-w-lg" />
      : /\.mp4$/i.test(lesson.media_path ?? "")
        ? <video controls src={lesson.mediaUrl} className="max-h-80 w-full max-w-lg rounded-md" />
        : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lesson.mediaUrl} alt="" className="max-h-80 rounded-md border" />
          )
    : lesson.skill === "listening"
      ? <p className="text-muted-foreground text-sm">{t("No audio has been uploaded yet.")}</p>
      : null

  return (
    <div className={lesson.words.length > 0 ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : "grid gap-6"}>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({ grammar: "Explanation", reading: "Read the text", listening: "Listen", speaking: "Your task", writing: "Your task", pronunciation: "Practise", vocabulary: "" }[lesson.skill])}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {media}
          {lesson.body && <p className={`whitespace-pre-wrap ${lesson.skill === "reading" ? "text-base leading-7" : "text-sm"}`}>{lesson.body}</p>}
          {lesson.skill === "grammar" && (
            <>
              {lesson.form && (
                <section className="grid gap-1">
                  <h3 className="font-medium">{t("Form")}</h3>
                  <pre className="bg-muted/50 overflow-x-auto rounded-md p-3 font-sans text-sm whitespace-pre-wrap">{lesson.form}</pre>
                </section>
              )}
              {lesson.usage && (
                <section className="grid gap-1">
                  <h3 className="font-medium">{t("Usage")}</h3>
                  <p className="text-sm whitespace-pre-wrap">{lesson.usage}</p>
                </section>
              )}
              {lesson.examples.length > 0 && (
                <section className="grid gap-1">
                  <h3 className="font-medium">{t("Examples")}</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {lesson.examples.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </section>
              )}
              {lesson.mistakes.length > 0 && (
                <section className="grid gap-1">
                  <h3 className="font-medium">{t("Common mistakes")}</h3>
                  <ul className="grid gap-2 text-sm">
                    {lesson.mistakes.map((m, i) => (
                      <li key={i} className="grid gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[#b02a2a] line-through dark:text-[#ef7b7b]">
                          <CircleXIcon className="size-3.5 shrink-0" aria-label={t("Wrong")} /> {m.incorrect}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#006300] dark:text-[#0ca30c]">
                          <CircleCheckIcon className="size-3.5 shrink-0" aria-label={t("Right")} /> {m.correct}
                        </span>
                        {m.note && <span className="text-muted-foreground">{m.note}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {lesson.skill === "listening" && lesson.secret?.transcript && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t("Transcript")}</summary>
              <p className="mt-2 text-sm whitespace-pre-wrap">{lesson.secret.transcript}</p>
            </details>
          )}
          {lesson.rubricItems.length > 0 && (
            <section className="grid gap-1">
              <h3 className="font-medium">{t("How it is marked")}</h3>
              <ul className="grid gap-1 text-sm">
                {lesson.rubricItems.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.criterion}</span> {t("({max_points} pts)", { max_points: r.max_points })}{r.description && ` – ${r.description}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>
      {lesson.words.length > 0 && (
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("Vocabulary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {lesson.words.map((w) => (
                <li key={w.id} className="grid">
                  <span>
                    <span className="font-medium">{w.word}</span> <span className="text-muted-foreground">{w.ipa} · {t(PART_OF_SPEECH_LABELS[w.part_of_speech])}</span>
                  </span>
                  <span>{w.meaning_vi}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

async function Exercises({ lesson, canEdit, studentId, attemptId }: { lesson: Lesson; canEdit: boolean; studentId: string | null; attemptId?: string }) {
  const t = await getT()
  const db = await createClient()
  if (canEdit) {
    const [keys, attempts, bank] = await Promise.all([
      listLessonKeys(db, lesson.questions.map((q) => q.id)),
      listLessonAttempts(db, lesson.id),
      lesson.status !== "archived" ? listBankQuestions(db) : [],
    ])
    const locked = attempts.length > 0
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Exercises and answer key")}</CardTitle>
          <CardDescription>
            {locked ? t("Students have done these exercises, so they can no longer change.") : t("Copied from the question bank; marked automatically.")}
          </CardDescription>
          {!locked && lesson.status !== "archived" && (
            <CardAction>
              <QuestionPicker
                target={{ kind: "lesson", lessonId: lesson.id }}
                alreadyAdded={lesson.questions.flatMap((q) => (q.source_question_id ? [q.source_question_id] : []))}
                questions={bank
                  .filter((q) => isAutoGraded(q.question_type, asContent(q.content)) || isSometimesAuto(q.question_type))
                  .map((q) => ({
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
          {lesson.questions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("No exercises yet.")}</p>
          ) : (
            <ol className="grid gap-4">
              {lesson.questions.map((q, i) => (
                <li key={q.id} className="flex items-start justify-between gap-2 border-b pb-4 last:border-0">
                  <div className="flex gap-2">
                    <span className="font-medium">{i + 1}.</span>
                    <QuestionPreview type={q.question_type} prompt={q.prompt} content={q.content} points={q.points} answerKey={keys.get(q.id)?.answer} explanation={keys.get(q.id)?.explanation} mediaUrl={q.mediaUrl} />
                  </div>
                  {!locked && (
                    <ConfirmActionButton variant="ghost" size="icon" aria-label={t("Remove exercise")} title={t("Remove this exercise?")} description={t("The bank question is kept.")} confirmLabel={t("Remove")} successMessage={t("Exercise removed.")} destructive action={removeLessonQuestionAction.bind(null, { lessonQuestionId: q.id })}>
                      <Trash2Icon />
                    </ConfirmActionButton>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!studentId) return null
  const [attempts, review] = await Promise.all([
    listLessonAttempts(db, lesson.id, studentId),
    attemptId ? getAttemptReview(db, attemptId).catch(() => null) : null,
  ])

  return (
    <>
      {review && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("Your answers ·")} {review.reduce((s, r) => s + (r.score ?? 0), 0)} / {review.reduce((s, r) => s + r.points, 0)}
            </CardTitle>
            <CardDescription>{t("Compare with the correct answers, then try again whenever you like.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 text-sm">
              {review.map((r, i) => {
                const content = asContent(r.content)
                const full = (r.score ?? 0) >= r.points
                return (
                  <li key={r.lesson_question_id} className="grid gap-1 border-b pb-3 last:border-0">
                    <span className="font-medium">
                      {i + 1}. {r.prompt}
                    </span>
                    {content.source_text && <span className="italic">{content.source_text}</span>}
                    <span className="inline-flex items-center gap-1">
                      {full ? (
                        <CircleCheckIcon className="size-4 text-[#006300] dark:text-[#0ca30c]" aria-label={t("Correct")} />
                      ) : (
                        <CircleXIcon className="size-4 text-[#b02a2a] dark:text-[#ef7b7b]" aria-label={t("Not correct")} />
                      )}
                      {t("Your answer:")} {describeResponse(r.question_type, content, asResponse(r.response)) ?? <em>{t("no answer")}</em>}
                    </span>
                    {!full && <span>{t("Correct answer: {value}", { value: describeKey(r.question_type, content, asKey(r.correct_answer)) ?? "—" })}</span>}
                    {r.unlisted && <span className="text-muted-foreground">{t("Your answer is not in the answer list; ask your teacher if you think it is right.")}</span>}
                    {r.explanation && <span className="text-muted-foreground">{r.explanation}</span>}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}
      {lesson.status === "published" && (
        <section className="grid gap-2">
          <h2 className="font-semibold">{review ? t("Try again") : t("Exercises")}</h2>
          <LessonExercises
            key={attemptId ?? "new"}
            lessonId={lesson.id}
            questions={lesson.questions.map((q) => ({ id: q.id, question_type: q.question_type, prompt: q.prompt, content: q.content, points: q.points, mediaUrl: q.mediaUrl }))}
          />
        </section>
      )}
      {attempts.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {t("Your attempts:")}
          {attempts.map((a, i) => (
            <span key={a.id}>
              {i > 0 && " · "}
              <Link href={`${lessonPath(lesson.id)}?attempt=${a.id}`} className="hover:underline">
                {Number(a.score)}/{Number(a.max_score)} ({formatDateTime(a.created_at)})
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  )
}

async function WorkSection({ lesson, studentId }: { lesson: Lesson; studentId: string | null }) {
  const t = await getT()
  if (!studentId) return null
  const submissions = await listSubmissions(await createClient(), { lessonId: lesson.id, studentId })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Hand in your work")}</CardTitle>
        <CardDescription>{lesson.response_mode && RESPONSE_MODE_LABELS[lesson.response_mode]}{t(". Your teacher will give you feedback.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {lesson.status === "published" && lesson.response_mode && (
          <WorkSubmission lessonId={lesson.id} studentId={studentId} mode={lesson.response_mode} minWords={lesson.min_words} maxWords={lesson.max_words} />
        )}
        {submissions.length > 0 && (
          <div className="grid gap-1 text-sm">
            <span className="font-medium">{t("Your submissions")}</span>
            <ul className="grid gap-1">
              {submissions.map((s) => (
                <li key={s.id}>
                  <Link href={lessonSubmissionPath(s.id)} className="hover:underline">
                    {t("Attempt {attempt} · {dateTime}", { attempt: s.attempt, dateTime: formatDateTime(s.submitted_at) })}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {s.status === "reviewed" ? t("feedback · {number}/{number2}", { number: Number(s.score), number2: Number(s.max_score) }) : t("waiting for feedback")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {lesson.secret?.model_answer && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">{t("Model answer")}</summary>
            <p className="mt-2 text-sm whitespace-pre-wrap">{lesson.secret.model_answer}</p>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

/** For teachers, admins and parents: who did the lesson and how it went (RLS-scoped). */
async function Results({ lesson }: { lesson: Lesson }) {
  const t = await getT()
  const db = await createClient()
  const [attempts, submissions] = await Promise.all([listLessonAttempts(db, lesson.id), listSubmissions(db, { lessonId: lesson.id })])
  if (attempts.length === 0 && submissions.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Students' work")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {attempts.map((a) => (
          <p key={a.id}>
            <span className="font-medium">{a.student?.full_name}</span> · {Number(a.score)}/{Number(a.max_score)} ·{" "}
            <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
          </p>
        ))}
        {submissions.map((s) => (
          <p key={s.id}>
            <span className="font-medium">{s.student?.full_name}</span> ·{" "}
            <Link href={lessonSubmissionPath(s.id)} className="hover:underline">
              {t("attempt {attempt}", { attempt: s.attempt })}
            </Link>{" "}
            · {s.status === "reviewed" ? `${Number(s.score)}/${Number(s.max_score)}` : t("waiting for feedback")}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}
