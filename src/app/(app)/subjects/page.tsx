import { LibraryIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { routes, subjectPath } from "@/config/routes"
import { SubjectDialog } from "@/features/subjects/components/subject-dialogs"
import { listSubjects } from "@/features/subjects/server/subject-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { normalizeSearch } from "@/lib/search"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Subjects & levels" }

export default async function SubjectsPage({ searchParams }: PageProps<"/subjects">) {
  await requireRouteAccess(routes.subjects)
  const params = await searchParams
  const q = firstParam(params, "q")
  const show = enumParam(params, "show", ["archived"] as const)

  const subjects = (await listSubjects(await createClient(), { archived: show === "archived" })).filter(
    (s) => !q || normalizeSearch(`${s.name} ${s.code}`).includes(normalizeSearch(q))
  )

  return (
    <>
      <PageHeader
        title="Subjects & levels"
        description="The catalogue that courses are built from."
        actions={<SubjectDialog />}
      />
      <ListFilters
        basePath={routes.subjects}
        values={{ q, show }}
        searchPlaceholder="Search subjects"
        filters={[{ param: "show", allLabel: "Live subjects", options: [{ value: "archived", label: "Archived" }] }]}
      />
      <SimpleTable
        rows={subjects}
        rowKey={(s) => s.id}
        empty={<EmptyState icon={LibraryIcon} title={q || show ? "No subjects match" : "No subjects yet"} />}
        columns={[
          { header: "Code", cell: (s) => <span className="font-mono text-xs">{s.code}</span> },
          {
            header: "Subject",
            cell: (s) => (
              <Link href={subjectPath(s.id)} className="font-medium hover:underline">
                {s.name}
              </Link>
            ),
          },
          {
            header: "Levels",
            cell: (s) =>
              s.liveLevels.length === 0 ? (
                "—"
              ) : (
                <div className="flex flex-wrap gap-1">
                  {s.liveLevels.map((level) => (
                    <Badge key={level.id} variant="secondary">
                      {level.name}
                    </Badge>
                  ))}
                </div>
              ),
          },
          { header: "Courses", cell: (s) => s.liveCourseCount },
        ]}
      />
    </>
  )
}
