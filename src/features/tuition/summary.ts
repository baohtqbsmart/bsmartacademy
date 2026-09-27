/**
 * Pure aggregation for the tuition dashboard and reports. Inputs are rows of
 * the invoice_balances view and the payments table (already RLS-scoped).
 *
 * Definitions:
 * - expected revenue: non-void invoice amounts DUE in the period
 * - collected revenue: completed payments RECEIVED in the period
 * - outstanding / overdue: remaining balances as of today (all periods)
 */
export type InvoiceRow = {
  student_id: string
  amount: number
  remaining: number
  due_date: string
  invoice_status: "open" | "void"
  payment_status: string
}

export type PaymentRow = {
  amount: number
  paid_on: string
  method: "cash" | "bank_transfer" | "other"
  status: "completed" | "voided"
}

export type Period = { from: string; to: string }

const within = (date: string, { from, to }: Period) => date >= from && date <= to
const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0)

export function summarize(invoices: InvoiceRow[], payments: PaymentRow[], period: Period) {
  const live = invoices.filter((i) => i.invoice_status !== "void")
  const completed = payments.filter((p) => p.status === "completed")
  const owing = live.filter((i) => i.remaining > 0)
  const overdue = owing.filter((i) => i.payment_status === "overdue")

  return {
    expected: sum(live.filter((i) => within(i.due_date, period)), (i) => i.amount),
    collected: sum(completed.filter((p) => within(p.paid_on, period)), (p) => p.amount),
    outstanding: sum(owing, (i) => i.remaining),
    overdue: sum(overdue, (i) => i.remaining),
    unpaidStudents: new Set(owing.map((i) => i.student_id)).size,
    overdueStudents: new Set(overdue.map((i) => i.student_id)).size,
  }
}

export type MonthlyPoint = { month: string; label: string; expected: number; collected: number }

/** Expected vs collected for each month of `year` ("2026-01" … "2026-12"). */
export function monthlySeries(invoices: InvoiceRow[], payments: PaymentRow[], year: number): MonthlyPoint[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`
    return {
      month,
      label: `T${index + 1}`,
      expected: sum(
        invoices.filter((i) => i.invoice_status !== "void" && i.due_date.startsWith(month)),
        (i) => i.amount
      ),
      collected: sum(
        payments.filter((p) => p.status === "completed" && p.paid_on.startsWith(month)),
        (p) => p.amount
      ),
    }
  })
}

export const PAYMENT_METHODS = ["cash", "bank_transfer", "other"] as const

/** Collected amount and count per payment method (fixed order). */
export function byMethod(payments: PaymentRow[], period: Period) {
  const completed = payments.filter((p) => p.status === "completed" && within(p.paid_on, period))
  return PAYMENT_METHODS.map((method) => {
    const rows = completed.filter((p) => p.method === method)
    return { method, amount: sum(rows, (p) => p.amount), count: rows.length }
  })
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}
