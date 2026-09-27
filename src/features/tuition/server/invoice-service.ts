import "server-only"

import type { z } from "zod"

import type { INVOICE_STATUS_FILTERS, invoiceSchema } from "@/features/tuition/schemas"
import { fromPostgrestError } from "@/lib/errors"
import { normalizeSearch } from "@/lib/search"
import type { DbClient } from "@/lib/supabase/types"

export type InvoiceStatusFilter = (typeof INVOICE_STATUS_FILTERS)[number]

const COLUMNS =
  "id, invoice_number, student_id, student_name, student_code, student_tuition_id, description, amount, paid, remaining, issue_date, due_date, payment_status, invoice_status, voided_at"

function toNumbers<T extends { amount: number; paid: number; remaining: number }>(row: T) {
  return { ...row, amount: Number(row.amount), paid: Number(row.paid), remaining: Number(row.remaining) }
}

/** Invoices with derived balances; RLS scopes rows to what the caller may see. */
export async function listInvoices(
  db: DbClient,
  filters: { status?: InvoiceStatusFilter; q?: string; studentId?: string } = {}
) {
  let query = db.from("invoice_balances").select(COLUMNS).order("due_date").order("invoice_number")
  const status = filters.status ?? "all"
  if (status === "outstanding") query = query.gt("remaining", 0)
  else if (status !== "all") query = query.eq("payment_status", status)
  if (filters.studentId) query = query.eq("student_id", filters.studentId)

  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const term = normalizeSearch(filters.q ?? "")
  return data
    .filter(
      (i) =>
        !term ||
        normalizeSearch(`${i.invoice_number} ${i.student_name ?? ""} ${i.student_code ?? ""} ${i.description}`).includes(term)
    )
    .map(toNumbers)
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>[number]

export async function getInvoice(db: DbClient, invoiceId: string) {
  const [balance, record] = await Promise.all([
    db.from("invoice_balances").select(COLUMNS).eq("id", invoiceId).maybeSingle(),
    db.from("invoices").select("void_reason, created_at").eq("id", invoiceId).maybeSingle(),
  ])
  if (balance.error) throw fromPostgrestError(balance.error)
  if (record.error) throw fromPostgrestError(record.error)
  if (!balance.data) return null
  return { ...toNumbers(balance.data), void_reason: record.data?.void_reason ?? null }
}

export async function createInvoice(db: DbClient, input: z.output<typeof invoiceSchema>) {
  const { data, error } = await db
    .from("invoices")
    .insert({ student_id: input.studentId, description: input.description, amount: input.amount, due_date: input.dueDate })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function voidInvoice(db: DbClient, invoiceId: string, reason: string) {
  const { error } = await db.rpc("void_invoice", { target_invoice_id: invoiceId, reason })
  if (error) throw fromPostgrestError(error)
}

/** For admin pickers: live students. */
export async function listBillableStudents(db: DbClient) {
  const { data, error } = await db
    .from("students")
    .select("id, student_code, full_name")
    .is("deleted_at", null)
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}
