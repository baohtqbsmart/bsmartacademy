import { FileTextIcon, ReceiptIcon, WalletIcon } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { PAYMENT_METHOD_LABELS } from "@/config/labels"
import { invoicePath, receiptPath } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import { CancelTuitionButton } from "@/features/tuition/components/tuition-dialogs"
import type { InvoiceListRow } from "@/features/tuition/server/invoice-service"
import type { PaymentListRow } from "@/features/tuition/server/payment-service"
import type { listStudentTuitions, listTuitionDiscounts } from "@/features/tuition/server/tuition-service"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { getT } from "@/i18n/server"

type Tuition = Awaited<ReturnType<typeof listStudentTuitions>>[number]
type Discount = Awaited<ReturnType<typeof listTuitionDiscounts>>[number]

type TuitionOverviewProps = {
  tuitions: Tuition[]
  discounts: Discount[]
  invoices: InvoiceListRow[]
  payments: PaymentListRow[]
  /** Show a student column (parents with several children, staff views). */
  showStudent?: boolean
  /** Finance staff: link invoices to their detail page and allow cancelling. */
  staff?: { canCancel: boolean }
}

const money = (value: number) => <span className="tabular-nums">{formatVnd(value)}</span>

/** Tuition, invoices and payments for one student or a family. */
export async function TuitionOverview({ tuitions, discounts, invoices, payments, showStudent, staff }: TuitionOverviewProps) {
  const tr = await getT()
  const studentColumn = <T extends { student_name?: string | null; student?: { full_name: string } | null }>() => ({
    header: "Student",
    cell: (row: T) => row.student_name ?? row.student?.full_name ?? "—",
  })

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="font-semibold">{tr("Tuition")}</h2>
        <SimpleTable
          rows={tuitions}
          rowKey={(t) => t.id}
          empty={<EmptyState icon={WalletIcon} title={tr("No tuition assigned")} />}
          columns={[
            ...(showStudent ? [studentColumn<Tuition>()] : []),
            {
              header: "Plan",
              cell: (t) => (
                <div className="grid">
                  <span className="font-medium">{t.plan_name}</span>
                  <span className="text-muted-foreground text-xs">{t.course_name}</span>
                </div>
              ),
            },
            { header: "Original", cell: (t) => money(t.original_amount) },
            {
              header: "Discount",
              cell: (t) => {
                const applied = discounts.filter((d) => d.student_tuition_id === t.id)
                return (
                  <div className="grid">
                    {money(t.discount_amount)}
                    {applied.map((d) => (
                      <span key={d.label} className="text-muted-foreground text-xs">
                        {d.label}
                      </span>
                    ))}
                  </div>
                )
              },
            },
            { header: "Final", cell: (t) => <span className="font-medium">{money(t.final_amount)}</span> },
            { header: "Paid", cell: (t) => money(t.paid) },
            { header: "Remaining", cell: (t) => money(t.remaining) },
            { header: "Next due", cell: (t) => formatDate(t.next_due_date) },
            { header: "Status", cell: (t) => <PaymentStatusBadge status={t.payment_status} /> },
            ...(staff?.canCancel
              ? [
                  {
                    header: "",
                    key: "actions",
                    cell: (t: Tuition) => (t.tuition_status === "active" ? <CancelTuitionButton tuitionId={t.id} /> : null),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{tr("Invoices")}</h2>
        <SimpleTable
          rows={invoices}
          rowKey={(i) => i.id}
          empty={<EmptyState icon={FileTextIcon} title={tr("No invoices")} />}
          columns={[
            {
              header: "Invoice",
              cell: (i) =>
                staff ? (
                  <Link href={invoicePath(i.id)} className="font-mono text-xs hover:underline">
                    {i.invoice_number}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{i.invoice_number}</span>
                ),
            },
            ...(showStudent ? [studentColumn<InvoiceListRow>()] : []),
            { header: "Description", cell: (i) => <span className="whitespace-normal">{i.description}</span> },
            { header: "Due", cell: (i) => formatDate(i.due_date) },
            { header: "Amount", cell: (i) => money(i.amount) },
            { header: "Paid", cell: (i) => money(i.paid) },
            { header: "Remaining", cell: (i) => money(i.remaining) },
            { header: "Status", cell: (i) => <PaymentStatusBadge status={i.payment_status} /> },
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{tr("Payment history")}</h2>
        <SimpleTable
          rows={payments}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={ReceiptIcon} title={tr("No payments yet")} />}
          columns={[
            {
              header: "Receipt",
              cell: (p) => (
                <Link href={receiptPath(p.id)} className="font-mono text-xs hover:underline">
                  {p.receipt_number}
                </Link>
              ),
            },
            ...(showStudent ? [studentColumn<PaymentListRow>()] : []),
            { header: "Date", cell: (p) => formatDate(p.paid_on) },
            { header: "Invoice", cell: (p) => <span className="font-mono text-xs">{p.invoice?.invoice_number}</span> },
            { header: "Amount", cell: (p) => money(p.amount) },
            { header: "Method", cell: (p) => PAYMENT_METHOD_LABELS[p.method] },
            { header: "Status", cell: (p) => <PaymentStatusBadge status={p.status} /> },
          ]}
        />
      </section>
    </div>
  )
}
