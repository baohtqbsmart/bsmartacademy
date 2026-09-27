import { WalletIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { routes, studentPath } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import { AssignTuitionDialog } from "@/features/tuition/components/tuition-dialogs"
import { listBillableStudents } from "@/features/tuition/server/invoice-service"
import { listDiscountRules, listPlans, listStudentTuitions } from "@/features/tuition/server/tuition-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { normalizeSearch } from "@/lib/search"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Student tuition" }

const STATUSES = ["overdue", "partially_paid", "unpaid", "paid", "cancelled"] as const
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  overdue: "Overdue",
  partially_paid: "Partially paid",
  unpaid: "Unpaid",
  paid: "Paid",
  cancelled: "Cancelled",
}

export default async function StudentTuitionPage({ searchParams }: PageProps<"/tuition/students">) {
  const user = await requireRouteAccess(routes.tuitionStudents)
  const canWrite = can(user.permissions, "tuition.write")
  const params = await searchParams
  const q = firstParam(params, "q")
  const status = enumParam(params, "status", STATUSES)

  const db = await createClient()
  const [tuitions, students, plans, rules] = await Promise.all([
    listStudentTuitions(db, { status }),
    canWrite ? listBillableStudents(db) : [],
    canWrite ? listPlans(db) : [],
    canWrite ? listDiscountRules(db) : [],
  ])
  const rows = tuitions.filter(
    (t) => !q || normalizeSearch(`${t.student_name ?? ""} ${t.student_code ?? ""} ${t.plan_name}`).includes(normalizeSearch(q))
  )
  const totals = rows.reduce(
    (sum, t) => ({ final: sum.final + t.final_amount, paid: sum.paid + t.paid, remaining: sum.remaining + t.remaining }),
    { final: 0, paid: 0, remaining: 0 }
  )

  return (
    <>
      <PageHeader
        title="Student tuition"
        description="Each row is a plan assigned to a student, with what has been paid and what remains."
        actions={
          canWrite && (
            <AssignTuitionDialog
              students={students.map((s) => ({ id: s.id, label: `${s.full_name} (${s.student_code})` }))}
              plans={plans.filter((p) => p.is_active).map((p) => ({ id: p.id, label: `${p.name} · ${formatVnd(p.amount)}`, amount: p.amount }))}
              rules={rules
                .filter((r) => r.is_active)
                .map((r) => ({ id: r.id, label: r.name, planId: r.plan_id, kind: r.kind, value: r.value }))}
            />
          )
        }
      />
      <ListFilters
        basePath={routes.tuitionStudents}
        values={{ q, status }}
        searchPlaceholder="Search student or plan"
        filters={[{ param: "status", allLabel: "All statuses", options: STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })) }]}
      />
      <SimpleTable
        rows={rows}
        rowKey={(t) => t.id}
        empty={<EmptyState icon={WalletIcon} title={q || status ? "No tuition matches your filters" : "No tuition assigned yet"} />}
        footer={
          rows.length > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {rows.length} shown · final {formatVnd(totals.final)} · paid {formatVnd(totals.paid)} · remaining {formatVnd(totals.remaining)}
            </p>
          )
        }
        columns={[
          {
            header: "Student",
            cell: (t) => (
              <Link href={studentPath(t.student_id, "tuition")} className="font-medium hover:underline">
                {t.student_name ?? "—"}
              </Link>
            ),
          },
          { header: "Plan", cell: (t) => <span className="whitespace-normal">{t.plan_name}</span> },
          { header: "Original", cell: (t) => <span className="tabular-nums">{formatVnd(t.original_amount)}</span> },
          { header: "Discount", cell: (t) => <span className="tabular-nums">{formatVnd(t.discount_amount)}</span> },
          { header: "Final", cell: (t) => <span className="tabular-nums font-medium">{formatVnd(t.final_amount)}</span> },
          { header: "Paid", cell: (t) => <span className="tabular-nums">{formatVnd(t.paid)}</span> },
          { header: "Remaining", cell: (t) => <span className="tabular-nums">{formatVnd(t.remaining)}</span> },
          { header: "Next due", cell: (t) => formatDate(t.next_due_date) },
          { header: "Status", cell: (t) => <PaymentStatusBadge status={t.payment_status} /> },
        ]}
      />
    </>
  )
}
