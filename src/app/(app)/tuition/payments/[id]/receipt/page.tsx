import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PAYMENT_METHOD_LABELS } from "@/config/labels"
import { routes } from "@/config/routes"
import { siteConfig } from "@/config/site"
import { PrintButton } from "@/features/tuition/components/print-button"
import { getPayment } from "@/features/tuition/server/payment-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { amountInVietnameseWords, formatVnd } from "@/lib/money"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Receipt" }

/**
 * Printable receipt (phiếu thu). Students and parents can open receipts for
 * their own payments; RLS returns nothing for anyone else's (404).
 */
export default async function ReceiptPage({ params }: PageProps<"/tuition/payments/[id]/receipt">) {
  const user = await requireRouteAccess(routes.receipt)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const payment = await getPayment(await createClient(), id)
  if (!payment) notFound()

  const voided = payment.status === "voided"
  const backHref = can(user.permissions, "tuition.read", ["all"]) ? routes.payments : routes.tuition

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeftIcon className="size-4" aria-hidden /> Back
        </Link>
        <PrintButton />
      </div>

      <article
        className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border bg-white p-8 text-sm text-black print:max-w-none print:border-0 print:p-0"
        aria-label={`Receipt ${payment.receipt_number}`}
      >
        {voided && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold tracking-widest text-red-600/15 uppercase"
          >
            Void
          </div>
        )}
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-base font-semibold">{siteConfig.name}</p>
            <p className="text-neutral-600">Phiếu thu học phí / Tuition payment receipt</p>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold">{payment.receipt_number}</p>
            <p className="text-neutral-600">{formatDate(payment.paid_on)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 py-4">
          <dt className="text-neutral-600">Học sinh / Student</dt>
          <dd>
            {payment.student?.full_name ?? "—"} <span className="text-neutral-600">({payment.student?.student_code})</span>
          </dd>
          <dt className="text-neutral-600">Hóa đơn / Invoice</dt>
          <dd>
            <span className="font-mono">{payment.invoice?.invoice_number}</span> – {payment.invoice?.description}
          </dd>
          <dt className="text-neutral-600">Hình thức / Method</dt>
          <dd>{PAYMENT_METHOD_LABELS[payment.method]}</dd>
          {payment.transaction_reference && (
            <>
              <dt className="text-neutral-600">Mã giao dịch / Reference</dt>
              <dd className="font-mono">{payment.transaction_reference}</dd>
            </>
          )}
          {payment.notes && (
            <>
              <dt className="text-neutral-600">Ghi chú / Notes</dt>
              <dd className="whitespace-pre-line">{payment.notes}</dd>
            </>
          )}
        </dl>

        <div className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-neutral-600">Số tiền / Amount</span>
            <span className="text-2xl font-semibold">{formatVnd(payment.amount)}</span>
          </div>
          <p className="mt-1 text-neutral-700 italic">Bằng chữ: {amountInVietnameseWords(payment.amount)}</p>
        </div>

        {voided && (
          <p className="mt-4 text-red-700">
            This payment was voided on {formatDate(payment.voided_at)}: {payment.void_reason}
          </p>
        )}

        <footer className="mt-8 grid grid-cols-2 gap-8 text-center">
          <div>
            <p className="text-neutral-600">Người nộp tiền / Payer</p>
            <div className="h-16" />
          </div>
          <div>
            <p className="text-neutral-600">Người thu tiền / Received by</p>
            <div className="h-10" />
            <p>{payment.recorded_by_name || "—"}</p>
          </div>
        </footer>
        <p className="mt-6 text-center text-xs text-neutral-500">
          Recorded {formatDate(payment.created_at)} · {payment.provider === "manual" ? "Recorded by staff" : payment.provider}
        </p>
      </article>
    </div>
  )
}
