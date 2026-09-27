import { FileCheckIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Button } from "@/components/ui/button"
import { routes, testPath } from "@/config/routes"
import { TestStatusBadge } from "@/features/tests/components/test-status-badge"
import { TEST_STATUS_LABELS, type TestStatus } from "@/features/tests/questions"
import { listTestClasses, listTests, type TestListItem } from "@/features/tests/server/test-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { enumParam, firstParam, uuidParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Tests" }

const STATUSES = ["draft", "published", "closed", "archived"] as const satisfies readonly TestStatus[]

export default async function TestsPage({ searchParams }: PageProps<"/tests">) {
  const user = await requireRouteAccess(routes.tests)
  const db = await createClient()
  const staff = can(user.permissions, "tests.read", ["all", "assigned"])

  if (!staff) {
    // Students and parents: published and closed tests of their (children's) classes.
    const tests = await listTests(db)
    const isParent = can(user.permissions, "tests.read", ["children"])
    return (
      <>
        <PageHeader title="Tests" description={isParent ? "Your children's tests and results." : "Your tests and results."} />
        <SimpleTable
          rows={tests}
          rowKey={(t) => t.id}
          empty={<EmptyState icon={FileCheckIcon} title="No tests yet" />}
          columns={[
            { header: "Test", cell: (t) => <TestLink test={t} /> },
            { header: "Class", cell: (t) => t.class?.name ?? "—" },
            { header: "Closes", cell: (t) => <span className="tabular-nums">{formatDateTime(t.available_until)}</span> },
            {
              header: "Attempts",
              cell: (t) => (
                <span className="tabular-nums">
                  {t.test_attempts.length} {isParent ? "" : `of ${t.max_attempts}`}
                </span>
              ),
            },
            { header: "Best result", cell: (t) => <BestResult test={t} /> },
            { header: "Status", cell: (t) => <TestStatusBadge status={t.status} /> },
          ]}
        />
      </>
    )
  }

  const params = await searchParams
  const q = firstParam(params, "q")
  const classId = uuidParam(params, "class")
  const status = enumParam(params, "status", STATUSES)
  const [tests, classes] = await Promise.all([listTests(db, { q, classId, status: status ?? "current" }), listTestClasses(db)])

  return (
    <>
      <PageHeader
        title="Tests"
        description="Build tests from the question bank, publish them to a class, mark and analyse the results."
        actions={
          can(user.permissions, "tests.write") && (
            <Button asChild>
              <Link href={routes.testNew}>
                <PlusIcon aria-hidden /> New test
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        basePath={routes.tests}
        values={{ q, class: classId, status }}
        searchPlaceholder="Search tests"
        filters={[
          { param: "class", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { param: "status", allLabel: "Not archived", options: STATUSES.map((s) => ({ value: s, label: TEST_STATUS_LABELS[s] })) },
        ]}
      />
      <SimpleTable
        rows={tests}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={FileCheckIcon} title="No tests match" />}
        columns={[
          { header: "Test", cell: (t) => <TestLink test={t} /> },
          { header: "Class", cell: (t) => t.class?.name ?? "—" },
          { header: "Questions", cell: (t) => <span className="tabular-nums">{t.test_questions[0]?.count ?? 0}</span> },
          {
            header: "Students attempted",
            cell: (t) => {
              const students = new Set(t.test_attempts.map((a) => a.student_id)).size
              const toMark = t.test_attempts.filter((a) => a.status === "submitted").length
              return (
                <span className="tabular-nums">
                  {students}
                  {toMark > 0 && <span className="text-muted-foreground"> · {toMark} to mark</span>}
                </span>
              )
            },
          },
          { header: "Closes", cell: (t) => <span className="tabular-nums">{formatDateTime(t.available_until)}</span> },
          { header: "Status", cell: (t) => <TestStatusBadge status={t.status} /> },
        ]}
      />
    </>
  )
}

function TestLink({ test }: { test: TestListItem }) {
  return (
    <Link href={testPath(test.id)} className="font-medium hover:underline">
      {test.title}
    </Link>
  )
}

function BestResult({ test }: { test: TestListItem }) {
  const graded = test.test_attempts.filter((a) => a.status === "graded" && a.score !== null)
  if (graded.length === 0) return <span className="text-muted-foreground">—</span>
  const best = Math.max(...graded.map((a) => Number(a.score)))
  return <span className="tabular-nums">{`${best} / ${Number(test.total_score)}`}</span>
}
