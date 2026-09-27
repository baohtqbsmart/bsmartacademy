import { FileTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { invoicePath, routes, studentPath } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import { CreateInvoiceDialog } from "@/features/tuition/components/tuition-dialogs"
import { INVOICE_STATUS_FILTERS } from "@/features/tuition/schemas"
import { listBillableStudents, listInvoices } from "@/features/tuition/server/invoice-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Invoices" }

const STATUS_LABELS: Record<(typeof INVOICE_STATUS_FILTERS)[number], string> = {
  outstanding: "Outstanding (not fully paid)",
  overdue: "Overdue",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
  all: "All invoices",
}

export default async function InvoicesPage({ searchParams }: PageProps<"/tuition/invoices">) {
  const user = await requireRouteAccess(routes.invoices)
  const canWrite = can(user.permissions, "tuition.write")
  const params = await searchParams
  const q = firstParam(params, "q")
  const status = enumParam(params, "status", INVOICE_STATUS_FILTERS)

  const db = await createClient()
  const [invoices, students] = await Promise.all([
    listInvoices(db, { status: status ?? "all", q }),
    canWrite ? listBillableStudents(db) : [],
  ])
  const remaining = invoices.reduce((sum, i) => sum + i.remaining, 0)
  const isOutstanding = status === "outstanding" || status === "overdue"

  return (
    <>
      <PageHeader
        title={isOutstanding ? "Outstanding fees" : "Invoices"}
        description={
          isOutstanding
            ? "Invoices not yet fully paid, oldest due date first."
            : "Every installment and charge issued to students."
        }
        actions={
          canWrite && (
            <CreateInvoiceDialog students={students.map((s) => ({ id: s.id, label: `${s.full_name} (${s.student_code})` }))} />
          )
        }
      />
      <ListFilters
        basePath={routes.invoices}
        values={{ q, status }}
        searchPlaceholder="Search invoice or student"
        filters={[
          {
            param: "status",
            allLabel: "Status",
            defaultValue: "all",
            options: INVOICE_STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          },
        ]}
      />
      <SimpleTable
        rows={invoices}
        rowKey={(i) => i.id}
        empty={<EmptyState icon={FileTextIcon} title={isOutstanding ? "Nothing outstanding" : "No invoices match"} />}
        footer={
          invoices.length > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {invoices.length} invoices · remaining {formatVnd(remaining)}
            </p>
          )
        }
        columns={[
          {
            header: "Invoice",
            cell: (i) => (
              <Link href={invoicePath(i.id)} className="font-mono text-xs hover:underline">
                {i.invoice_number}
              </Link>
            ),
          },
          {
            header: "Student",
            cell: (i) => (
              <Link href={studentPath(i.student_id, "tuition")} className="hover:underline">
                {i.student_name ?? "—"}
              </Link>
            ),
          },
          { header: "Description", cell: (i) => <span className="whitespace-normal">{i.description}</span> },
          { header: "Due", cell: (i) => formatDate(i.due_date) },
          { header: "Amount", cell: (i) => <span className="tabular-nums">{formatVnd(i.amount)}</span> },
          { header: "Paid", cell: (i) => <span className="tabular-nums">{formatVnd(i.paid)}</span> },
          { header: "Remaining", cell: (i) => <span className="tabular-nums font-medium">{formatVnd(i.remaining)}</span> },
          { header: "Status", cell: (i) => <PaymentStatusBadge status={i.payment_status} /> },
        ]}
      />
    </>
  )
}
