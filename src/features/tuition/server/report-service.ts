import "server-only"

import { byMethod, monthlySeries, summarize, yearPeriod } from "@/features/tuition/summary"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

/**
 * Loads what the dashboard/reports need and aggregates it. All invoices are
 * needed for outstanding balances (any period); payments only for the year.
 */
export async function loadTuitionReport(db: DbClient, year: number) {
  const period = yearPeriod(year)
  const [invoiceResult, paymentResult, tuitionResult] = await Promise.all([
    db.from("invoice_balances").select("student_id, amount, remaining, due_date, invoice_status, payment_status"),
    db.from("payments").select("amount, paid_on, method, status").gte("paid_on", period.from).lte("paid_on", period.to),
    db.from("student_tuition_balances").select("course_name, final_amount, paid, remaining, tuition_status"),
  ])
  if (invoiceResult.error) throw fromPostgrestError(invoiceResult.error)
  if (paymentResult.error) throw fromPostgrestError(paymentResult.error)
  if (tuitionResult.error) throw fromPostgrestError(tuitionResult.error)

  const invoices = invoiceResult.data.map((i) => ({ ...i, amount: Number(i.amount), remaining: Number(i.remaining) }))
  const payments = paymentResult.data.map((p) => ({ ...p, amount: Number(p.amount) }))

  // Per course (from tuition snapshots): billed, collected, still owed.
  const courses = new Map<string, { course: string; billed: number; paid: number; remaining: number; students: number }>()
  for (const t of tuitionResult.data) {
    if (t.tuition_status === "cancelled") continue
    const row = courses.get(t.course_name) ?? { course: t.course_name, billed: 0, paid: 0, remaining: 0, students: 0 }
    row.billed += Number(t.final_amount)
    row.paid += Number(t.paid)
    row.remaining += Number(t.remaining)
    row.students += 1
    courses.set(t.course_name, row)
  }

  return {
    summary: summarize(invoices, payments, period),
    monthly: monthlySeries(invoices, payments, year),
    methods: byMethod(payments, period),
    courses: [...courses.values()].sort((a, b) => b.billed - a.billed),
  }
}
