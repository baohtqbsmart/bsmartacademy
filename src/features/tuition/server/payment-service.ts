import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

const COLUMNS = `id, receipt_number, invoice_id, student_id, amount, paid_on, method, transaction_reference, notes,
  status, recorded_by_name, provider, void_reason, voided_at, created_at,
  invoice:invoices(invoice_number, description, amount),
  student:students(student_code, full_name)`

function toNumbers<T extends { amount: number; invoice: { amount: number } | null }>(row: T) {
  return {
    ...row,
    amount: Number(row.amount),
    invoice: row.invoice ? { ...row.invoice, amount: Number(row.invoice.amount) } : null,
  }
}

/** Payment history visible to the caller (RLS). */
export async function listPayments(
  db: DbClient,
  filters: {
    from?: string
    to?: string
    method?: Enums<"payment_method">
    status?: Enums<"payment_status">
    invoiceId?: string
    studentId?: string
  } = {}
) {
  let query = db.from("payments").select(COLUMNS).order("paid_on", { ascending: false }).order("created_at", { ascending: false })
  if (filters.from) query = query.gte("paid_on", filters.from)
  if (filters.to) query = query.lte("paid_on", filters.to)
  if (filters.method) query = query.eq("method", filters.method)
  if (filters.status) query = query.eq("status", filters.status)
  if (filters.invoiceId) query = query.eq("invoice_id", filters.invoiceId)
  if (filters.studentId) query = query.eq("student_id", filters.studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map(toNumbers)
}

export type PaymentListRow = Awaited<ReturnType<typeof listPayments>>[number]

export async function getPayment(db: DbClient, paymentId: string) {
  const { data, error } = await db.from("payments").select(COLUMNS).eq("id", paymentId).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data ? toNumbers(data) : null
}

export async function voidPayment(db: DbClient, paymentId: string, reason: string) {
  const { error } = await db.rpc("void_payment", { target_payment_id: paymentId, reason })
  if (error) throw fromPostgrestError(error)
}
