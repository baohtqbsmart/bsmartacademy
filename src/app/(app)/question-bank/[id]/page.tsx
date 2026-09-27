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

export const metadata: Metadata = { title: "Question" }

export default async function QuestionPage({ params }: PageProps<"/question-bank/[id]">) {
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
        <ArrowLeftIcon className="size-4" aria-hidden /> Question bank
      </Link>
      <PageHeader
        title="Question"
        description={question.tags.length ? question.tags.map((t) => `#${t}`).join(" ") : undefined}
        actions={
          <>
            {!active && <Badge variant="outline">Archived</Badge>}
            {canEdit && active && (
              <Button variant="outline" size="sm" asChild>
                <Link href={questionEditPath(id)}>
                  <PencilIcon aria-hidden /> Edit
                </Link>
              </Button>
            )}
            {canWrite && (
              <ConfirmActionButton
                size="sm"
                title="Duplicate this question?"
                description="You get your own copy (with its answer key) to adapt; the original is unchanged."
                confirmLabel="Duplicate"
                successMessage="Copy created."
                action={duplicateQuestionAction.bind(null, { questionId: id })}
              >
                <CopyIcon aria-hidden /> Duplicate
              </ConfirmActionButton>
            )}
            {canEdit &&
              (active ? (
                <ConfirmActionButton
                  size="sm"
                  title="Archive this question?"
                  description="It leaves the bank's active list and cannot be added to new tests. Tests already using it keep their copy."
                  confirmLabel="Archive"
                  successMessage="Question archived."
                  action={archiveQuestionAction.bind(null, { questionId: id })}
                >
                  <ArchiveIcon aria-hidden /> Archive
                </ConfirmActionButton>
              ) : (
                <ConfirmActionButton
                  size="sm"
                  title="Restore this question?"
                  description="It returns to the active bank."
                  confirmLabel="Restore"
                  successMessage="Question restored."
                  action={restoreQuestionAction.bind(null, { questionId: id })}
                >
                  <ArchiveRestoreIcon aria-hidden /> Restore
                </ConfirmActionButton>
              ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Preview with answer key</CardTitle>
            <CardDescription>Staff only. Students see the question without the key, inside a test.</CardDescription>
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
                <span className="text-sm font-medium">{question.question_type === "listening" ? "Audio" : "Picture or audio (optional)"}</span>
                {question.media_path && (
                  <div>
                    <ConfirmActionButton
                      variant="ghost"
                      size="sm"
                      title="Remove the media?"
                      description="Tests that already use this question keep theirs."
                      confirmLabel="Remove"
                      successMessage="Media removed."
                      action={removeQuestionMediaAction.bind(null, { questionId: id })}
                    >
                      <XIcon aria-hidden /> Remove media
                    </ConfirmActionButton>
                  </div>
                )}
                <FileUploader
                  target={{ kind: "question", questionId: id }}
                  remaining={1}
                  label={question.media_path ? "Replace media" : "Upload media"}
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
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="text-sm">{value}</span>
                </div>
              ))}
              {question.duplicated_from && (
                <Link href={questionPath(question.duplicated_from)} className="text-sm hover:underline">
                  Copied from another question
                </Link>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Used in tests</CardTitle>
              <CardDescription>Only tests you can see are listed.</CardDescription>
            </CardHeader>
            <CardContent>
              {question.usedIn.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not used yet.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {question.usedIn.map((test) => (
                    <li key={test.id}>
                      <Link href={testPath(test.id)} className="hover:underline">
                        {test.title}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {test.class?.name} · {TEST_STATUS_LABELS[test.status]}
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
