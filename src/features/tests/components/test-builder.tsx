"use client"

import { ArchiveIcon, ArchiveRestoreIcon, ArrowDownIcon, ArrowUpIcon, LockIcon, LockOpenIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addQuestionsAction,
  changeTestStatusAction,
  deleteDraftTestAction,
  moveTestQuestionAction,
  removeTestQuestionAction,
  setTestQuestionPointsAction,
} from "@/features/tests/actions"
import { addLessonQuestionsAction } from "@/features/english/actions"
import {
  CEFR_LABELS,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type CefrLevel,
  type Difficulty,
  type QuestionType,
  type TestStatus,
} from "@/features/tests/questions"

export function TestLifecycle({ testId, status, hasQuestions, canDelete }: { testId: string; status: TestStatus; hasQuestions: boolean; canDelete: boolean }) {
  const run = (action: string) => changeTestStatusAction.bind(null, { testId, action })
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <ConfirmActionButton
          variant="default"
          title="Publish the test?"
          description="Students in the class can take it (from its opening time). Its questions can no longer change."
          confirmLabel="Publish"
          successMessage="Test published."
          action={run("publish")}
        >
          <SendIcon aria-hidden /> Publish{!hasQuestions && " (add questions first)"}
        </ConfirmActionButton>
      )}
      {status === "published" && (
        <ConfirmActionButton
          title="Close the test?"
          description="Attempts still open are handed in with what was saved. You can reopen it later."
          confirmLabel="Close"
          successMessage="Test closed."
          action={run("close")}
        >
          <LockIcon aria-hidden /> Close
        </ConfirmActionButton>
      )}
      {status === "closed" && (
        <ConfirmActionButton title="Reopen the test?" description="Students can start attempts again." confirmLabel="Reopen" successMessage="Test reopened." action={run("reopen")}>
          <LockOpenIcon aria-hidden /> Reopen
        </ConfirmActionButton>
      )}
      {status !== "archived" && (
        <ConfirmActionButton
          title="Archive the test?"
          description="It disappears from students' and parents' lists; attempts and results are kept."
          confirmLabel="Archive"
          successMessage="Test archived."
          action={run("archive")}
        >
          <ArchiveIcon aria-hidden /> Archive
        </ConfirmActionButton>
      )}
      {status === "archived" && (
        <ConfirmActionButton title="Restore the test?" description="It returns as closed (or as a draft if never published)." confirmLabel="Restore" successMessage="Test restored." action={run("restore")}>
          <ArchiveRestoreIcon aria-hidden /> Restore
        </ConfirmActionButton>
      )}
      {canDelete && (
        <ConfirmActionButton
          variant="ghost"
          title="Delete this draft?"
          description="The draft and its question copies are deleted. Bank questions are not affected."
          confirmLabel="Delete"
          successMessage="Draft deleted."
          destructive
          action={deleteDraftTestAction.bind(null, { testId })}
        >
          <Trash2Icon aria-hidden /> Delete draft
        </ConfirmActionButton>
      )}
    </div>
  )
}

export type PickerQuestion = {
  id: string
  prompt: string
  question_type: QuestionType
  difficulty: Difficulty
  cefr_level: CefrLevel | null
  topic: string | null
  tags: string[]
  subject: string | null
  points: number
}

/** Select bank questions to copy into the test, with search and filters. */
export function QuestionPicker({
  target,
  questions,
  alreadyAdded,
}: {
  /** Where the copies go: a test, or an English lesson's exercises. */
  target: { kind: "test"; testId: string } | { kind: "lesson"; lessonId: string }
  questions: PickerQuestion[]
  alreadyAdded: string[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [type, setType] = useState<"" | QuestionType>("")
  const added = useMemo(() => new Set(alreadyAdded), [alreadyAdded])

  const term = search.trim().toLowerCase()
  const shown = questions.filter(
    (q) =>
      !added.has(q.id) &&
      (!type || q.question_type === type) &&
      (!term || `${q.prompt} ${q.topic ?? ""} ${q.tags.join(" ")} ${q.subject ?? ""}`.toLowerCase().includes(term))
  )

  return (
    <ActionDialog
      trigger={
        <Button size="sm">
          <PlusIcon aria-hidden /> Add from the bank
        </Button>
      }
      title="Add questions from the bank"
      description={`Questions are copied into the ${target.kind} with their answer keys; later bank edits do not change it.`}
      submitLabel={`Add ${selected.length || ""} question${selected.length === 1 ? "" : "s"}`.replace("  ", " ")}
      successMessage="Questions added."
      onOpen={() => setSelected([])}
      onSubmit={() =>
        target.kind === "test"
          ? addQuestionsAction({ testId: target.testId, questionIds: selected })
          : addLessonQuestionsAction({ lessonId: target.lessonId, questionIds: selected })
      }
    >
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" placeholder="Search prompt, topic, tag" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as "" | QuestionType)}
          aria-label="Question type"
        >
          <option value="">All types</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <ul className="grid max-h-96 gap-1 overflow-y-auto">
        {shown.length === 0 && <li className="text-muted-foreground py-4 text-center text-sm">No matching questions.</li>}
        {shown.map((q) => (
          <li key={q.id}>
            <label className="hover:bg-muted flex items-start gap-2 rounded-md p-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary mt-1 size-4"
                checked={selected.includes(q.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, q.id] : s.filter((id) => id !== q.id)))}
              />
              <span className="grid gap-1">
                <span className="line-clamp-2">{q.prompt}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="outline">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                  <Badge variant="secondary">{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                  {q.cefr_level && <Badge variant="secondary">{CEFR_LABELS[q.cefr_level]}</Badge>}
                  {q.subject && <span className="text-muted-foreground text-xs">{q.subject}</span>}
                  <span className="text-muted-foreground text-xs tabular-nums">{Number(q.points)} pt</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </ActionDialog>
  )
}

/** Reorder / remove / re-weight a draft test's questions. */
export function TestQuestionControls({ testQuestionId, points, first, last }: { testQuestionId: string; points: number; first: boolean; last: boolean }) {
  const [value, setValue] = useState(String(points))
  const [isPending, startTransition] = useTransition()
  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      const result = await moveTestQuestionAction({ testQuestionId, direction })
      if (!result.ok) toast.error(result.error.message)
    })
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ActionDialog
        trigger={
          <Button variant="ghost" size="sm" className="tabular-nums">
            {points} pt
          </Button>
        }
        title="Points for this question"
        submitLabel="Save"
        successMessage="Points saved."
        onOpen={() => setValue(String(points))}
        onSubmit={() => setTestQuestionPointsAction({ testQuestionId, points: value })}
      >
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Points" />
      </ActionDialog>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Move up"
        disabled={first || isPending}
        onClick={() => move("up")}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Move down"
        disabled={last || isPending}
        onClick={() => move("down")}
      >
        <ArrowDownIcon />
      </Button>
      <ConfirmActionButton
        variant="ghost"
        size="icon"
        aria-label="Remove question"
        title="Remove this question from the test?"
        description="The bank question itself is kept."
        confirmLabel="Remove"
        successMessage="Question removed."
        destructive
        action={removeTestQuestionAction.bind(null, { testQuestionId })}
      >
        <Trash2Icon />
      </ConfirmActionButton>
    </div>
  )
}
