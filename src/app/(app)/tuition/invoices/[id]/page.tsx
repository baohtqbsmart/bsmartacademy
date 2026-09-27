import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { SimpleTable } from "@/components/shared/simple-table"
import { Card, CardContent } from "@/components/ui/card"
import { PAYMENT_METHOD_LABELS } from "@/config/labels"
import { receiptPath, routes, studentPath } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import {
  RecordPaymentDialog,
  VoidInvoiceButton,
  VoidPaymentButton,
} from "@/features/tuition/components/tuition-dialogs"
import { getInvoice } from "@/features/tuition/server/invoice-service"
import { listPayments } from "@/features/tuition/server/payment-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Invoice") }
}

export default async function InvoicePage({ params }: PageProps<"/tuition/invoices/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.invoiceDetail)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const db = await createClient()
  const [invoice, payments] = await Promise.all([getInvoice(db, id), listPayments(db, { invoiceId: id })])
  if (!invoice) notFound()

  const canPay = can(user.permissions, "payments.write") && invoice.invoice_status === "open" && invoice.remaining > 0
  const canVoid =
    can(user.permissions, "tuition.write") && invoice.invoice_status === "open" && !payments.some((p) => p.status === "completed")

  return (
    <>
      <Link href={routes.invoices} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Invoices")}
      </Link>
      <PageHeader
        title={t("Invoice {invoice_number}", { invoice_number: invoice.invoice_number })}
        description={invoice.description}
        actions={
          <>
            <PaymentStatusBadge status={invoice.payment_status} />
            {canVoid && <VoidInvoiceButton invoiceId={invoice.id} />}
            {canPay && <RecordPaymentDialog invoiceId={invoice.id} remaining={invoice.remaining} />}
          </>
        }
      />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Detail label={t("Student")}>
            <Link href={studentPath(invoice.student_id, "tuition")} className="hover:underline">
              {invoice.student_name ?? "—"}
            </Link>
          </Detail>
          <Detail label={t("Issued")}>{formatDate(invoice.issue_date)}</Detail>
          <Detail label={t("Due")}>{formatDate(invoice.due_date)}</Detail>
          <Detail label={t("Amount")}>{formatVnd(invoice.amount)}</Detail>
          <Detail label={t("Paid")}>{formatVnd(invoice.paid)}</Detail>
          <Detail label={t("Remaining")}>
            <span className="font-semibold">{formatVnd(invoice.remaining)}</span>
          </Detail>
          {invoice.void_reason && (
            <div className="sm:col-span-3 lg:col-span-6">
              <Detail label={t("Void reason")}>{invoice.void_reason}</Detail>
            </div>
          )}
        </CardContent>
      </Card>
      <section className="grid gap-2">
        <h2 className="font-semibold">{t("Payments")}</h2>
        <SimpleTable
          rows={payments}
          rowKey={(p) => p.id}
          empty={t("No payments recorded.")}
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
            { header: "Amount", cell: (p) => <span className="tabular-nums">{formatVnd(p.amount)}</span> },
            { header: "Method", cell: (p) => PAYMENT_METHOD_LABELS[p.method] },
            { header: "Reference", cell: (p) => p.transaction_reference ?? "—" },
            { header: "Recorded by", cell: (p) => p.recorded_by_name || "—" },
            {
              header: "Status",
              cell: (p) => (
                <div className="grid gap-0.5">
                  <PaymentStatusBadge status={p.status} />
                  {p.void_reason && <span className="text-muted-foreground text-xs">{p.void_reason}</span>}
                </div>
              ),
            },
            ...(can(user.permissions, "payments.write")
              ? [
                  {
                    header: "",
                    key: "actions",
                    cell: (p: (typeof payments)[number]) => (p.status === "completed" ? <VoidPaymentButton paymentId={p.id} /> : null),
                  },
                ]
              : []),
          ]}
        />
      </section>
    </>
  )
}

async function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const t = await getT()
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{t(label)}</span>
      <span className="text-sm tabular-nums">{children}</span>
    </div>
  )
}
