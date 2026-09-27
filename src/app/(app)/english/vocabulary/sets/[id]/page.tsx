import { ArchiveIcon, ArrowLeftIcon, EyeOffIcon, SendIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes, wordSetPracticePath } from "@/config/routes"
import { setSetStatusAction } from "@/features/english/actions"
import { SpeakButton } from "@/features/english/components/media"
import { SetDialog, SetWordsDialog } from "@/features/english/components/set-editor"
import { getSet, listProgress, listWords } from "@/features/english/server/vocabulary-service"
import { ACTIVITIES, ACTIVITY_LABELS, MASTERED_BOX, PART_OF_SPEECH_LABELS, STATUS_LABELS } from "@/features/english/skills"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { CEFR_LABELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Word set" }

export default async function WordSetPage({ params }: PageProps<"/english/vocabulary/sets/[id]">) {
  const user = await requireRouteAccess(routes.wordSet)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const set = await getSet(db, id)
  if (!set) notFound()

  const canEdit = can(user.permissions, "english.write", ["all"]) || (can(user.permissions, "english.write") && set.created_by === user.id)
  const isStudent = can(user.permissions, "english.practice", ["own"])
  const studentId = isStudent ? await getOwnStudentId(db, user.id) : null
  const [progress, bank] = await Promise.all([studentId ? listProgress(db, studentId) : [], canEdit ? listWords(db) : []])
  const box = new Map(progress.map((p) => [p.word_id, p]))
  const today = todayInAcademy()
  const due = set.words.filter((w) => box.get(w.id) && box.get(w.id)!.next_review_on <= today).length
  const learnt = set.words.filter((w) => (box.get(w.id)?.box ?? 0) >= MASTERED_BOX).length

  return (
    <>
      <Link href={routes.vocabulary} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Vocabulary
      </Link>
      <PageHeader
        title={set.title}
        description={set.description ?? undefined}
        actions={
          <>
            {set.cefr_level && <Badge variant="secondary">{CEFR_LABELS[set.cefr_level]}</Badge>}
            {set.status !== "published" && <Badge variant="outline">{STATUS_LABELS[set.status]}</Badge>}
            {canEdit && (
              <>
                <SetDialog
                  initial={{ setId: set.id, title: set.title, description: set.description ?? "", cefrLevel: set.cefr_level ?? "", topic: set.topic ?? "" }}
                />
                <SetWordsDialog
                  setId={set.id}
                  selected={set.words.map((w) => w.id)}
                  words={bank.map((w) => ({ id: w.id, word: w.word, meaning_vi: w.meaning_vi, topic: w.topic, cefr_level: w.cefr_level }))}
                />
                {set.status === "published" ? (
                  <ConfirmActionButton size="sm" title="Unpublish this set?" description="Students no longer see it; their history is kept." confirmLabel="Unpublish" successMessage="Set unpublished." action={setSetStatusAction.bind(null, { setId: set.id, status: "draft" })}>
                    <EyeOffIcon aria-hidden /> Unpublish
                  </ConfirmActionButton>
                ) : (
                  <ConfirmActionButton size="sm" variant="default" title="Publish this set?" description="Every student can practise it." confirmLabel="Publish" successMessage="Set published." action={setSetStatusAction.bind(null, { setId: set.id, status: "published" })}>
                    <SendIcon aria-hidden /> Publish
                  </ConfirmActionButton>
                )}
                {set.status !== "archived" && (
                  <ConfirmActionButton size="sm" title="Archive this set?" description="It leaves the vocabulary page; practice history is kept." confirmLabel="Archive" successMessage="Set archived." action={setSetStatusAction.bind(null, { setId: set.id, status: "archived" })}>
                    <ArchiveIcon aria-hidden /> Archive
                  </ConfirmActionButton>
                )}
              </>
            )}
          </>
        }
      />

      {isStudent && set.status === "published" && (
        <Card>
          <CardHeader>
            <CardTitle>Practise</CardTitle>
            <CardDescription>
              {learnt} of {set.words.length} words learnt well{due > 0 && ` · ${due} to review today`}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIVITIES.map((a) => (
              <Link key={a} href={wordSetPracticePath(set.id, a)} className="hover:border-primary grid gap-1 rounded-md border p-3">
                <span className="font-medium">{ACTIVITY_LABELS[a].title}</span>
                <span className="text-muted-foreground text-sm">{ACTIVITY_LABELS[a].description}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {set.words.map((w) => {
          const p = box.get(w.id)
          return (
            <li key={w.id}>
              <Card className="h-full gap-2 py-4">
                <CardContent className="grid gap-2 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid">
                      <span className="text-lg font-semibold">{w.word}</span>
                      <span className="text-muted-foreground text-sm">
                        {w.ipa} <span className="italic">{PART_OF_SPEECH_LABELS[w.part_of_speech]}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p && (
                        <Badge variant="outline" title={`Box ${p.box} of 5`}>
                          {p.box >= MASTERED_BOX ? "Learnt" : p.next_review_on <= today ? "Review today" : `Box ${p.box}/5`}
                        </Badge>
                      )}
                      <SpeakButton text={w.word} audioUrl={w.audioUrl} size="icon" />
                    </div>
                  </div>
                  {w.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.imageUrl} alt="" className="max-h-32 rounded-md object-contain" />
                  )}
                  <p>{w.meaning_vi}</p>
                  {w.definition_en && <p className="text-muted-foreground text-sm">{w.definition_en}</p>}
                  {w.example && <p className="text-sm italic">“{w.example}”</p>}
                  {(w.collocations.length > 0 || w.synonyms.length > 0 || w.antonyms.length > 0) && (
                    <p className="text-muted-foreground text-xs">
                      {w.collocations.length > 0 && `Collocations: ${w.collocations.join(", ")}. `}
                      {w.synonyms.length > 0 && `Synonyms: ${w.synonyms.join(", ")}. `}
                      {w.antonyms.length > 0 && `Opposites: ${w.antonyms.join(", ")}.`}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </>
  )
}
