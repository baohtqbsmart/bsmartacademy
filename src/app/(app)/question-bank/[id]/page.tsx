import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, CopyIcon, PencilIcon, XIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { questionEditPath, questionPath, routes, testPath } from "@/config/routes"
import { FileUploader } from "@/features/assignments/components/file-uploader"
import { SKILL_LABELS } from "@/features/assignments/status"
import {
  archiveQuestionAction,
  duplicateQuestionAction,
  removeQuestionMediaAction,
  restoreQuestionAction,
} from "@/features/question-bank/actions"
import { getBankQuestion } from "@/features/question-bank/server/bank-service"
import { QuestionPreview } from "@/features/tests/components/question-preview"
import { CEFR_LABELS, DIFFICULTY_LABELS, gradingLabel, asContent, TEST_STATUS_LABELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Question") }
}

export default async function QuestionPage({ params }: PageProps<"/question-bank/[id]">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.questionDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const question = await getBankQuestion(await createClient(), id)
  if (!question) notFound()

  const canWrite = can(user.permissions, "question_bank.write")
  const canEdit = canWrite && (can(user.permissions, "question_bank.write", ["all"]) || question.created_by === user.id)
  const active = question.status === "active"

  const details = [
    ["Subject", question.subject?.name ?? "—"],
    ["Skill", question.skill ? SKILL_LABELS[question.skill] : "—"],
    ["CEFR level", question.cefr_level ? CEFR_LABELS[question.cefr_level] : "—"],
    ["Topic", question.topic ?? "—"],
    ["Difficulty", DIFFICULTY_LABELS[question.difficulty]],
    ["Grading", gradingLabel(question.question_type, asContent(question.content))],
    ["Author", question.created_by_name || "—"],
    ["Version", `${question.version} · updated ${formatDateTime(question.updated_at)}`],
  ]

  return (
    <>
      <Link href={routes.questionBank} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {tr("Question bank")}
      </Link>
      <PageHeader
        title={tr("Question")}
        description={question.tags.length ? question.tags.map((t) => `#${t}`).join(" ") : undefined}
        actions={
          <>
            {!active && <Badge variant="outline">{tr("Archived")}</Badge>}
            {canEdit && active && (
              <Button variant="outline" size="sm" asChild>
                <Link href={questionEditPath(id)}>
                  <PencilIcon aria-hidden /> {tr("Edit")}
                </Link>
              </Button>
            )}
            {canWrite && (
              <ConfirmActionButton
                size="sm"
                title={tr("Duplicate this question?")}
                description={tr("You get your own copy (with its answer key) to adapt; the original is unchanged.")}
                confirmLabel={tr("Duplicate")}
                successMessage={tr("Copy created.")}
                action={duplicateQuestionAction.bind(null, { questionId: id })}
              >
                <CopyIcon aria-hidden /> {tr("Duplicate")}
              </ConfirmActionButton>
            )}
            {canEdit &&
              (active ? (
                <ConfirmActionButton
                  size="sm"
                  title={tr("Archive this question?")}
                  description={tr("It leaves the bank's active list and cannot be added to new tests. Tests already using it keep their copy.")}
                  confirmLabel={tr("Archive")}
                  successMessage={tr("Question archived.")}
                  action={archiveQuestionAction.bind(null, { questionId: id })}
                >
                  <ArchiveIcon aria-hidden /> {tr("Archive")}
                </ConfirmActionButton>
              ) : (
                <ConfirmActionButton
                  size="sm"
                  title={tr("Restore this question?")}
                  description={tr("It returns to the active bank.")}
                  confirmLabel={tr("Restore")}
                  successMessage={tr("Question restored.")}
                  action={restoreQuestionAction.bind(null, { questionId: id })}
                >
                  <ArchiveRestoreIcon aria-hidden /> {tr("Restore")}
                </ConfirmActionButton>
              ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tr("Preview with answer key")}</CardTitle>
            <CardDescription>{tr("Staff only. Students see the question without the key, inside a test.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <QuestionPreview
              type={question.question_type}
              prompt={question.prompt}
              content={question.content}
              points={question.points}
              answerKey={question.key?.answer}
              explanation={question.key?.explanation}
              mediaUrl={question.mediaUrl}
            />
            {canEdit && active && (
              <div className="grid gap-2 border-t pt-4">
                <span className="text-sm font-medium">{question.question_type === "listening" ? tr("Audio") : tr("Picture or audio (optional)")}</span>
                {question.media_path && (
                  <div>
                    <ConfirmActionButton
                      variant="ghost"
                      size="sm"
                      title={tr("Remove the media?")}
                      description={tr("Tests that already use this question keep theirs.")}
                      confirmLabel={tr("Remove")}
                      successMessage={tr("Media removed.")}
                      action={removeQuestionMediaAction.bind(null, { questionId: id })}
                    >
                      <XIcon aria-hidden /> {tr("Remove media")}
                    </ConfirmActionButton>
                  </div>
                )}
                <FileUploader
                  target={{ kind: "question", questionId: id }}
                  remaining={1}
                  label={question.media_path ? tr("Replace media") : tr("Upload media")}
                  accept=".mp3,.m4a,.wav,.webm,.png,.jpg,.jpeg,.webp"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-3">
              {details.map(([label, value]) => (
                <div key={label} className="grid gap-0.5">
                  <span className="text-muted-foreground text-xs">{tr(label)}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
              {question.duplicated_from && (
                <Link href={questionPath(question.duplicated_from)} className="text-sm hover:underline">
                  {tr("Copied from another question")}
                </Link>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tr("Used in tests")}</CardTitle>
              <CardDescription>{tr("Only tests you can see are listed.")}</CardDescription>
            </CardHeader>
            <CardContent>
              {question.usedIn.length === 0 ? (
                <p className="text-muted-foreground text-sm">{tr("Not used yet.")}</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {question.usedIn.map((test) => (
                    <li key={test.id}>
                      <Link href={testPath(test.id)} className="hover:underline">
                        {test.title}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {test.class?.name} · {tr(TEST_STATUS_LABELS[test.status])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
