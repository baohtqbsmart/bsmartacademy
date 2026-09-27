import { ArchiveIcon, BookAIcon, PencilIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { TabNav } from "@/components/shared/tab-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes, wordEditPath, wordSetPath } from "@/config/routes"
import { setWordStatusAction } from "@/features/english/actions"
import { ContentMediaUpload, SpeakButton } from "@/features/english/components/media"
import { SetDialog } from "@/features/english/components/set-editor"
import { listSets, listTopics, listWords, withWordMedia } from "@/features/english/server/vocabulary-service"
import { PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH, STATUS_LABELS } from "@/features/english/skills"
import { CEFR_LABELS, CEFR_LEVELS } from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Vocabulary" }

export default async function VocabularyPage({ searchParams }: PageProps<"/english/vocabulary">) {
  const user = await requireRouteAccess(routes.vocabulary)
  const params = await searchParams
  const view = enumParam(params, "view", ["sets", "words"] as const) ?? "sets"
  const canWrite = can(user.permissions, "english.write")
  const db = await createClient()

  return (
    <>
      <PageHeader
        title="Vocabulary"
        description="Word sets to practise, and the word bank behind them."
        actions={
          canWrite && (
            <>
              <SetDialog />
              <Button asChild>
                <Link href={routes.wordNew}>
                  <PlusIcon aria-hidden /> New word
                </Link>
              </Button>
            </>
          )
        }
      />
      <TabNav
        label="Vocabulary sections"
        active={view}
        tabs={[
          { value: "sets", label: "Word sets", href: routes.vocabulary },
          { value: "words", label: "Word bank", href: `${routes.vocabulary}?view=words` },
        ]}
      />
      {view === "sets" ? <Sets db={db} canWrite={canWrite} /> : <Words db={db} params={params} canWrite={canWrite} userId={user.id} writeAll={can(user.permissions, "english.write", ["all"])} />}
    </>
  )
}

async function Sets({ db, canWrite }: { db: Awaited<ReturnType<typeof createClient>>; canWrite: boolean }) {
  const sets = await listSets(db)
  if (sets.length === 0) return <EmptyState icon={BookAIcon} title="No word sets yet" />
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle>
              <Link href={wordSetPath(s.id)} className="hover:underline">
                {s.title}
              </Link>
            </CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular-nums">{s.wordCount} words</span>
            {s.cefr_level && <Badge variant="secondary">{CEFR_LABELS[s.cefr_level]}</Badge>}
            {s.topic && <Badge variant="outline">{s.topic}</Badge>}
            {canWrite && s.status !== "published" && <Badge variant="outline">{STATUS_LABELS[s.status]}</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function Words({
  db,
  params,
  canWrite,
  userId,
  writeAll,
}: {
  db: Awaited<ReturnType<typeof createClient>>
  params: Record<string, string | string[] | undefined>
  canWrite: boolean
  userId: string
  writeAll: boolean
}) {
  const filters = {
    q: firstParam(params, "q"),
    topic: firstParam(params, "topic"),
    cefr: enumParam(params, "cefr", CEFR_LEVELS),
    pos: enumParam(params, "pos", PARTS_OF_SPEECH),
    status: canWrite ? enumParam(params, "status", ["draft", "archived"] as const) : undefined,
  }
  const [words, topics] = await Promise.all([listWords(db, filters), listTopics(db)])
  const rows = await withWordMedia(db, words)

  return (
    <>
      <ListFilters
        basePath={routes.vocabulary}
        preserve={{ view: "words" }}
        values={{ q: filters.q, topic: filters.topic, cefr: filters.cefr, pos: filters.pos, status: filters.status }}
        searchPlaceholder="Search words or meanings"
        filters={[
          { param: "topic", allLabel: "All topics", options: topics.map((t) => ({ value: t, label: t })) },
          { param: "cefr", allLabel: "All levels", options: CEFR_LEVELS.map((l) => ({ value: l, label: CEFR_LABELS[l] })) },
          { param: "pos", allLabel: "All parts of speech", options: PARTS_OF_SPEECH.map((p) => ({ value: p, label: PART_OF_SPEECH_LABELS[p] })) },
          ...(canWrite ? [{ param: "status", allLabel: "Published", options: [{ value: "draft", label: "Drafts" }, { value: "archived", label: "Archived" }] }] : []),
        ]}
      />
      <SimpleTable
        rows={rows}
        rowKey={(w) => w.id}
        empty={<EmptyState icon={BookAIcon} title="No words match" />}
        footer={rows.length > 0 && <p className="text-muted-foreground text-sm">{rows.length} words</p>}
        columns={[
          {
            header: "Word",
            cell: (w) => (
              <div className="flex items-start gap-2">
                <SpeakButton text={w.word} audioUrl={w.audioUrl} size="icon" />
                <div className="grid">
                  <span className="font-medium">{w.word}</span>
                  <span className="text-muted-foreground text-xs">
                    {w.ipa} <span className="italic">{PART_OF_SPEECH_LABELS[w.part_of_speech]}</span>
                  </span>
                </div>
              </div>
            ),
          },
          { header: "Meaning", cell: (w) => <span className="whitespace-normal">{w.meaning_vi}</span> },
          {
            header: "Definition and example",
            cell: (w) => (
              <div className="grid max-w-md gap-1 whitespace-normal">
                {w.definition_en && <span>{w.definition_en}</span>}
                {w.example && <span className="text-muted-foreground italic">“{w.example}”</span>}
                {(w.synonyms.length > 0 || w.antonyms.length > 0 || w.collocations.length > 0) && (
                  <span className="text-muted-foreground text-xs">
                    {w.collocations.length > 0 && `Collocations: ${w.collocations.join(", ")}. `}
                    {w.synonyms.length > 0 && `Synonyms: ${w.synonyms.join(", ")}. `}
                    {w.antonyms.length > 0 && `Opposites: ${w.antonyms.join(", ")}.`}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: "Level · topic",
            cell: (w) => (
              <span className="text-sm">
                {w.cefr_level ? CEFR_LABELS[w.cefr_level] : "—"} · {w.topic ?? "—"}
              </span>
            ),
          },
          {
            header: "Picture",
            cell: (w) =>
              w.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.imageUrl} alt={w.word} className="h-10 w-10 rounded object-cover" />
              ) : (
                "—"
              ),
          },
          ...(canWrite
            ? [
                {
                  header: "",
                  key: "manage",
                  cell: (w: (typeof rows)[number]) =>
                    writeAll || w.created_by === userId ? (
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="icon" asChild aria-label={`Edit ${w.word}`}>
                          <Link href={wordEditPath(w.id)}>
                            <PencilIcon />
                          </Link>
                        </Button>
                        <ContentMediaUpload target={{ kind: "word", wordId: w.id, field: "audio" }} accept=".mp3,.m4a,.wav,.webm" label="Audio" />
                        <ContentMediaUpload target={{ kind: "word", wordId: w.id, field: "image" }} accept=".png,.jpg,.jpeg,.webp" label="Picture" />
                        {w.status !== "archived" && (
                          <ConfirmActionButton
                            variant="ghost"
                            size="icon"
                            aria-label={`Archive ${w.word}`}
                            title={`Archive "${w.word}"?`}
                            description="It disappears from students' lists and new sets; sets and practice history keep it."
                            confirmLabel="Archive"
                            successMessage="Word archived."
                            action={setWordStatusAction.bind(null, { wordId: w.id, status: "archived" })}
                          >
                            <ArchiveIcon />
                          </ConfirmActionButton>
                        )}
                      </div>
                    ) : null,
                },
              ]
            : []),
        ]}
      />
    </>
  )
}
