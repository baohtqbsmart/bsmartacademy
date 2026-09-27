import { FileCheckIcon } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { testPath } from "@/config/routes"
import { AttemptStatusText } from "@/features/tests/components/test-status-badge"
import type { TestListItem } from "@/features/tests/server/test-service"

/** Student profile tab: every test the student has attempted, with each attempt. */
export function StudentTests({ tests, studentId }: { tests: TestListItem[]; studentId: string }) {
  const rows = tests
    .map((test) => ({ test, attempts: test.test_attempts.filter((a) => a.student_id === studentId).sort((a, b) => b.attempt_number - a.attempt_number) }))
    .filter((r) => r.attempts.length > 0)
  return (
    <SimpleTable
      rows={rows}
      rowKey={(r) => r.test.id}
      empty={<EmptyState icon={FileCheckIcon} title="No test attempts yet" />}
      columns={[
        {
          header: "Test",
          cell: (r) => (
            <Link href={testPath(r.test.id)} className="font-medium hover:underline">
              {r.test.title}
            </Link>
          ),
        },
        { header: "Class", cell: (r) => r.test.class?.name ?? "—" },
        {
          header: "Attempts",
          key: "attempts",
          cell: (r) => (
            <ul className="grid gap-0.5">
              {r.attempts.map((a) => (
                <li key={a.attempt_number} className="flex gap-2">
                  <span className="text-muted-foreground">#{a.attempt_number}</span>
                  <AttemptStatusText status={a.status} score={a.score} total={r.test.total_score} />
                </li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  )
}

