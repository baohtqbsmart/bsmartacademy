import { describe, expect, it } from "vitest"

import { byMethod, monthlySeries, summarize, yearPeriod, type InvoiceRow, type PaymentRow } from "@/features/tuition/summary"

const invoice = (overrides: Partial<InvoiceRow>): InvoiceRow => ({
  student_id: "s1",
  amount: 1_000_000,
  remaining: 1_000_000,
  due_date: "2026-03-10",
  invoice_status: "open",
  payment_status: "unpaid",
  ...overrides,
})

const payment = (overrides: Partial<PaymentRow>): PaymentRow => ({
  amount: 500_000,
  paid_on: "2026-03-05",
  method: "cash",
  status: "completed",
  ...overrides,
})

const invoices = [
  invoice({ student_id: "s1", remaining: 0, payment_status: "paid" }),
  invoice({ student_id: "s2", remaining: 400_000, payment_status: "overdue" }),
  invoice({ student_id: "s2", due_date: "2026-04-10", remaining: 1_000_000, payment_status: "unpaid" }),
  invoice({ student_id: "s3", due_date: "2025-12-10", remaining: 1_000_000, payment_status: "overdue" }),
  invoice({ student_id: "s4", invoice_status: "void", remaining: 0, payment_status: "void" }),
]

const payments = [
  payment({ amount: 1_000_000 }),
  payment({ amount: 600_000, method: "bank_transfer", paid_on: "2026-03-20" }),
  payment({ amount: 999_999, status: "voided" }),
  payment({ amount: 250_000, paid_on: "2025-12-31" }),
]

describe("summarize", () => {
  it("computes the dashboard figures for a period", () => {
    expect(summarize(invoices, payments, yearPeriod(2026))).toEqual({
      expected: 3_000_000, // three live 2026 invoices; the void one and the 2025 one excluded
      collected: 1_600_000, // voided and 2025 payments excluded
      outstanding: 2_400_000, // all periods
      overdue: 1_400_000,
      unpaidStudents: 2, // s2, s3
      overdueStudents: 2,
    })
  })
})

describe("monthlySeries", () => {
  it("returns 12 months with expected and collected", () => {
    const series = monthlySeries(invoices, payments, 2026)
    expect(series).toHaveLength(12)
    expect(series[2]).toEqual({ month: "2026-03", label: "T3", expected: 2_000_000, collected: 1_600_000 })
    expect(series[3]).toMatchObject({ expected: 1_000_000, collected: 0 })
    expect(series[11]).toMatchObject({ expected: 0, collected: 0 })
  })
})

describe("byMethod", () => {
  it("totals completed payments per method in a fixed order", () => {
    expect(byMethod(payments, yearPeriod(2026))).toEqual([
      { method: "cash", amount: 1_000_000, count: 1 },
      { method: "bank_transfer", amount: 600_000, count: 1 },
      { method: "other", amount: 0, count: 0 },
    ])
  })
})
