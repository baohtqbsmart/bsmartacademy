import { ReceiptIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { PAYMENT_METHOD_LABELS } from "@/config/labels"
import { invoicePath, receiptPath, routes } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import { PAYMENT_METHOD_VALUES } from "@/features/tuition/schemas"
import { listPayments } from "@/features/tuition/server/payment-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { enumParam, firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Payments" }

const PERIODS = ["30d", "month", "year", "all"] as const
const PERIOD_LABELS: Record<(typeof PERIODS)[number], string> = {
  "30d": "Last 30 days",
  month: "This month",
  year: "This year",
  all: "All time",
}

function periodStart(period: (typeof PERIODS)[number], today: string) {
  if (period === "month") return `${today.slice(0, 7)}-01`
  if (period === "year") return `${today.slice(0, 4)}-01-01`
  if (period === "all") return undefined
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 29)
  return date.toISOString().slice(0, 10)
}

export default async function PaymentsPage({ searchParams }: PageProps<"/tuition/payments">) {
  await requireRouteAccess(routes.payments)
  const params = await searchParams
  const period = enumParam(params, "period", PERIODS) ?? "30d"
  const method = enumParam(params, "method", PAYMENT_METHOD_VALUES)
  const q = firstParam(params, "q")?.toLowerCase()

  const payments = (
    await listPayments(await createClient(), { from: periodStart(period, todayInAcademy()), method })
  ).filter(
    (p) =>
      !q ||
      [p.receipt_number, p.student?.full_name, p.student?.student_code, p.transaction_reference, p.invoice?.invoice_number]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
  )
  const total = payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0)

  return (
    <>
      <PageHeader title="Payments" description="Payment history. Voided payments stay listed with their reason." />
      <ListFilters
        basePath={routes.payments}
        values={{ q, period: period === "30d" ? undefined : period, method }}
        searchPlaceholder="Receipt, student, reference"
        filters={[
          { param: "period", allLabel: "Period", defaultValue: "30d", options: PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] })) },
          { param: "method", allLabel: "All methods", options: PAYMENT_METHOD_VALUES.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })) },
        ]}
      />
      <SimpleTable
        rows={payments}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={ReceiptIcon} title="No payments in this period" />}
        footer={
          payments.length > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {payments.length} payments · collected {formatVnd(total)} (excluding voided)
            </p>
          )
        }
        columns={[
          {
            header: "Receipt",
            cell: (p) => (
              <Link href={receiptPath(p.id)} className="font-mono text-xs hover:underline">
                {p.receipt_number}
              </Link>
            ),
          },
          { header: "Date", cell: (p) => formatDate(p.paid_on) },
          { header: "Student", cell: (p) => p.student?.full_name ?? "—" },
          {
            header: "Invoice",
            cell: (p) => (
              <Link href={invoicePath(p.invoice_id)} className="font-mono text-xs hover:underline">
                {p.invoice?.invoice_number}
              </Link>
            ),
          },
          { header: "Amount", cell: (p) => <span className="tabular-nums">{formatVnd(p.amount)}</span> },
          { header: "Method", cell: (p) => PAYMENT_METHOD_LABELS[p.method] },
          { header: "Reference", cell: (p) => p.transaction_reference ?? "—" },
          { header: "Staff", cell: (p) => p.recorded_by_name || "—" },
          { header: "Status", cell: (p) => <PaymentStatusBadge status={p.status} /> },
        ]}
      />
    </>
  )
}
