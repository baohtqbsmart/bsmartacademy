import { LibraryBigIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { questionPath, routes } from "@/config/routes"
import { ASSIGNMENT_SKILLS, SKILL_LABELS } from "@/features/assignments/status"
import { listBankQuestions, listSubjects, listTags } from "@/features/question-bank/server/bank-service"
import {
  CEFR_LABELS,
  CEFR_LEVELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
} from "@/features/tests/questions"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Question bank") }
}

export default async function QuestionBankPage({ searchParams }: PageProps<"/question-bank">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.questionBank)
  const params = await searchParams
  const filters = {
    q: firstParam(params, "q"),
    subjectId: uuidParam(params, "subject"),
    type: enumParam(params, "type", QUESTION_TYPES),
    skill: enumParam(params, "skill", ASSIGNMENT_SKILLS),
    cefr: enumParam(params, "cefr", CEFR_LEVELS),
    difficulty: enumParam(params, "difficulty", DIFFICULTIES),
    tag: firstParam(params, "tag"),
    status: enumParam(params, "status", ["archived"] as const),
    owner: enumParam(params, "owner", ["mine"] as const),
  }

  const db = await createClient()
  const [questions, subjects, tags] = await Promise.all([
    listBankQuestions(db, {
      ...filters,
      archived: filters.status === "archived",
      mineOnly: filters.owner === "mine" ? user.id : undefined,
    }),
    listSubjects(db),
    listTags(db),
  ])

  return (
    <>
      <PageHeader
        title={tr("Question bank")}
        description={tr("Reusable questions shared by all teachers. Answer keys are never shown to students.")}
        actions={
          can(user.permissions, "question_bank.write") && (
            <Button asChild>
              <Link href={routes.questionNew}>
                <PlusIcon aria-hidden /> {tr("New question")}
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.questionBank}
        values={{
          q: filters.q,
          subject: filters.subjectId,
          type: filters.type,
          skill: filters.skill,
          cefr: filters.cefr,
          difficulty: filters.difficulty,
          tag: filters.tag,
          status: filters.status,
          owner: filters.owner,
        }}
        searchPlaceholder={tr("Search questions, topics, tags")}
        filters={[
          { param: "subject", allLabel: "All subjects", options: subjects.map((s) => ({ value: s.id, label: s.name })) },
          { param: "type", allLabel: "All types", options: QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] })) },
          { param: "skill", allLabel: "All skills", options: ASSIGNMENT_SKILLS.map((s) => ({ value: s, label: SKILL_LABELS[s] })) },
          { param: "cefr", allLabel: "All levels", options: CEFR_LEVELS.map((l) => ({ value: l, label: CEFR_LABELS[l] })) },
          { param: "difficulty", allLabel: "Any difficulty", options: DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] })) },
          { param: "tag", allLabel: "All tags", options: tags.map((t) => ({ value: t, label: `#${t}` })) },
          { param: "owner", allLabel: "Everyone's", options: [{ value: "mine", label: "My questions" }] },
          { param: "status", allLabel: "Active", options: [{ value: "archived", label: "Archived" }] },
        ]}
      />
      <SimpleTable
        rows={questions}
        rowKey={(q) => q.id}
        empty={<EmptyState icon={LibraryBigIcon} title={tr("No questions match")} />}
        footer={questions.length > 0 && <p className="text-muted-foreground text-sm">{tr("{length} questions", { length: questions.length })}</p>}
        columns={[
          {
            header: "Question",
            cell: (q) => (
              <div className="grid max-w-md gap-1">
                <Link href={questionPath(q.id)} className="line-clamp-2 font-medium whitespace-normal hover:underline">
                  {q.prompt}
                </Link>
                {q.tags.length > 0 && <span className="text-muted-foreground text-xs">{q.tags.map((t) => `#${t}`).join(" ")}</span>}
              </div>
            ),
          },
          { header: "Type", cell: (q) => <Badge variant="outline">{tr(QUESTION_TYPE_LABELS[q.question_type])}</Badge> },
          { header: "Subject", cell: (q) => q.subject?.name ?? "—" },
          { header: "Topic", cell: (q) => q.topic ?? "—" },
          { header: "Level", cell: (q) => (q.cefr_level ? CEFR_LABELS[q.cefr_level] : "—") },
          { header: "Difficulty", cell: (q) => DIFFICULTY_LABELS[q.difficulty] },
          { header: "Points", cell: (q) => <span className="tabular-nums">{Number(q.points)}</span> },
          { header: "Author", cell: (q) => (q.created_by === user.id ? "You" : q.created_by_name || "—") },
        ]}
      />
    </>
  )
}
