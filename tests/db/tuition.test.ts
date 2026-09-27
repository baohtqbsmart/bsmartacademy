import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  superAdmin: "superadmin@bsmart.test",
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test",
  ha: "gv.ha@bsmart.test",
  lan: "ph.lan@bsmart.test", // HS001 + HS002
  duc: "ph.duc@bsmart.test", // HS003
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // no tuition
  vinh: "gv.vinh@bsmart.test", // deactivated
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const studentIds: Record<string, string> = {}
const planIds: Record<string, string> = {}
let siblingRule: string
let ketOnlyRule: string

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows)
    studentIds[r.student_code] = r.id
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.tuition_plans")).rows) planIds[r.code] = r.id
  siblingRule = (await db.query<{ id: string }>("select id from public.tuition_discount_rules where kind = 'percent' and value = 10")).rows[0].id
  ketOnlyRule = (await db.query<{ id: string }>("select id from public.tuition_discount_rules where plan_id is not null")).rows[0].id
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const num = (value: unknown) => Number(value)

/** Student codes whose rows `who` can see in `relation`. */
const studentsIn = (who: Who, relation: string) =>
  as(db, ids[who], async (tx) => {
    const { rows } = await tx.query<{ student_id: string }>(`select distinct student_id from public.${relation}`)
    return rows.map((r) => Object.entries(studentIds).find(([, id]) => id === r.student_id)![0]).sort()
  })

describe("who can see financial data", () => {
  const RELATIONS = ["student_tuitions", "invoices", "payments", "invoice_balances", "student_tuition_balances"]

  it.each([
    ["admin", { student_tuitions: ["HS001", "HS002", "HS003", "HS005"], payments: ["HS001", "HS002", "HS005"] }],
    ["hung", { student_tuitions: [], payments: [] }],
    ["ha", { student_tuitions: [], payments: [] }],
    ["vinh", { student_tuitions: [], payments: [] }],
    ["huy", { student_tuitions: ["HS001"], payments: ["HS001"] }],
    ["chau", { student_tuitions: ["HS003"], payments: [] }],
    ["khang", { student_tuitions: [], payments: [] }],
    ["lan", { student_tuitions: ["HS001", "HS002"], payments: ["HS001", "HS002"] }],
    ["duc", { student_tuitions: ["HS003"], payments: [] }],
  ] as const)("%s", async (who, expected) => {
    for (const relation of RELATIONS) {
      const want = relation === "payments" ? expected.payments : expected.student_tuitions
      expect([relation, await studentsIn(who, relation)]).toEqual([relation, [...want]])
    }
  })

  it("plans and discount rules are visible to finance staff only", async () => {
    const plans = async (who: Who) => (await run(who, "select 1 from public.tuition_plans")).rows.length
    const rules = async (who: Who) => (await run(who, "select 1 from public.tuition_discount_rules")).rows.length
    expect(await plans("admin")).toBe(3)
    expect(await rules("admin")).toBe(3)
    for (const who of ["hung", "lan", "huy"] as const) {
      expect(await plans(who)).toBe(0)
      expect(await rules(who)).toBe(0)
    }
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["invoices", "payments", "tuition_plans", "invoice_balances"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })

  it("archiving a student hides their financial records from their parent", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.students set deleted_at = now() where student_code = 'HS001'")
      await switchUser(tx, ids.lan)
      const ids_ = async (relation: string) =>
        (await tx.query<{ student_id: string }>(`select distinct student_id from public.${relation}`)).rows.map((r) => r.student_id)
      return {
        tuitions: await ids_("student_tuitions"),
        invoices: await ids_("invoices"),
        payments: await ids_("payments"),
      }
    })
    expect(seen).toEqual({ tuitions: [studentIds.HS002], invoices: [studentIds.HS002], payments: [studentIds.HS002] })
  })
})

describe("per-user grants (explicit authorisation)", () => {
  const grant = (tx: Session, target: Who, permission: string, scope = "all") =>
    tx.query("select public.grant_user_permission($1, $2, $3)", [ids[target], permission, scope])

  it("an admin can give one teacher read access to finance", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await grant(tx, "hung", "tuition.read")
      await switchUser(tx, ids.hung)
      const hung = (await tx.query("select 1 from public.invoices")).rows.length
      const perms = await column(tx, "select permission_code from public.my_permissions() where permission_code like 'tuition%'")
      await switchUser(tx, ids.ha)
      const ha = (await tx.query("select 1 from public.invoices")).rows.length
      return { hung, perms, ha }
    })
    expect(seen.hung).toBeGreaterThan(0)
    expect(seen.perms).toEqual(["tuition.read"])
    expect(seen.ha).toBe(0) // other teachers are unaffected
  })

  it("revoking removes the access again", async () => {
    const count = await as(db, ids.admin, async (tx) => {
      await grant(tx, "hung", "tuition.read")
      await tx.query("select public.revoke_user_permission($1, 'tuition.read', 'all')", [ids.hung])
      await switchUser(tx, ids.hung)
      return (await tx.query("select 1 from public.invoices")).rows.length
    })
    expect(count).toBe(0)
  })

  it("nobody can grant what they do not hold", async () => {
    await expect(as(db, ids.admin, (tx) => grant(tx, "hung", "roles.manage"))).rejects.toThrow(/permissions you hold/)
  })

  it("rank rules apply: admins cannot grant to admins or above, nor to themselves", async () => {
    await expect(as(db, ids.admin, (tx) => grant(tx, "superAdmin", "tuition.read"))).rejects.toThrow(/lower role/)
    await expect(as(db, ids.admin, (tx) => grant(tx, "admin", "tuition.read"))).rejects.toThrow(/own account/)
  })

  it("teachers, parents and students cannot grant anything", async () => {
    for (const who of ["hung", "lan", "huy"] as const) {
      await expect(as(db, ids[who], (tx) => grant(tx, "chau", "tuition.read"))).rejects.toThrow(/permission to manage users/)
    }
  })

  it("grants cannot be written directly", async () => {
    await expect(
      run("admin", "insert into public.user_permissions (profile_id, permission_code) values ($1, 'tuition.read')", [ids.hung])
    ).rejects.toThrow(/permission denied/)
  })

  it("a deactivated user's grants stop working", async () => {
    const count = await as(db, ids.admin, async (tx) => {
      await grant(tx, "hung", "tuition.read")
      await tx.query("select public.set_user_active($1, false)", [ids.hung])
      await switchUser(tx, ids.hung)
      return (await tx.query("select 1 from public.invoices")).rows.length
    })
    expect(count).toBe(0)
  })
})

describe("assigning tuition", () => {
  const assign = (tx: Session, student: string, plan: string, rules: string[] = [], manual = 0) =>
    tx.query<{ id: string }>("select public.assign_tuition($1, $2, '2026-10-01', $3::uuid[], $4) as id", [
      studentIds[student],
      planIds[plan],
      rules,
      manual,
    ])

  it("splits the final amount into installments that add up exactly", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const { rows } = await assign(tx, "HS004", "FLYERS-Q", [siblingRule], 333)
      const tuition = (await tx.query<{ original_amount: string; discount_amount: string; final_amount: string }>(
        "select original_amount, discount_amount, final_amount from public.student_tuitions where id = $1",
        [rows[0].id]
      )).rows[0]
      const invoices = (await tx.query<{ amount: string; due_date: string }>(
        "select amount, to_char(due_date, 'YYYY-MM-DD') as due_date from public.invoices where student_tuition_id = $1 order by due_date",
        [rows[0].id]
      )).rows
      return { tuition, invoices }
    })
    expect(num(result.tuition.original_amount)).toBe(15_000_000)
    expect(num(result.tuition.discount_amount)).toBe(1_500_333) // 10% + 333 manual
    expect(num(result.tuition.final_amount)).toBe(13_499_667)
    expect(result.invoices.map((i) => i.due_date)).toEqual(["2026-10-01", "2027-01-01", "2027-04-01", "2027-07-01"])
    expect(result.invoices.map((i) => num(i.amount))).toEqual([3_374_000, 3_374_000, 3_374_000, 3_377_667])
    expect(result.invoices.reduce((sum, i) => sum + num(i.amount), 0)).toBe(13_499_667)
  })

  it("never discounts below zero and issues no invoice when nothing is owed", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const { rows } = await assign(tx, "HS004", "KET-1L", [], 50_000_000)
      return {
        final: (await tx.query<{ final_amount: string }>("select final_amount from public.student_tuitions where id = $1", [rows[0].id]))
          .rows[0].final_amount,
        invoices: (await tx.query("select 1 from public.invoices where student_tuition_id = $1", [rows[0].id])).rows.length,
      }
    })
    expect(num(result.final)).toBe(0)
    expect(result.invoices).toBe(0)
  })

  it("rejects discount rules restricted to another plan", async () => {
    await expect(as(db, ids.admin, (tx) => assign(tx, "HS004", "TOAN6-9T", [ketOnlyRule]))).rejects.toThrow(
      /cannot be used with this plan/
    )
  })

  it("rejects unknown discount rules and negative discounts", async () => {
    await expect(
      as(db, ids.admin, (tx) => assign(tx, "HS004", "KET-1L", ["00000000-0000-4000-8000-000000000000"]))
    ).rejects.toThrow(/Unknown discount rule/)
    await expect(as(db, ids.admin, (tx) => assign(tx, "HS004", "KET-1L", [], -5))).rejects.toThrow(/cannot be negative/)
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot assign tuition", async (who) => {
    await expect(as(db, ids[who], (tx) => assign(tx, "HS004", "KET-1L"))).rejects.toThrow(/permission to manage tuition/)
  })

  it("tuition and invoices cannot be edited or deleted directly", async () => {
    await expect(run("admin", "update public.invoices set amount = 1")).rejects.toThrow(/permission denied/)
    await expect(run("admin", "update public.student_tuitions set discount_amount = 0")).rejects.toThrow(/permission denied/)
    await expect(run("admin", "delete from public.invoices")).rejects.toThrow(/permission denied/)
  })
})

describe("payments", () => {
  const openInvoice = async (tx: Session, student: string) =>
    (await tx.query<{ id: string; remaining: string }>(
      "select id, remaining from public.invoice_balances where student_code = $1 and remaining > 0 order by due_date limit 1",
      [student]
    )).rows[0]
  const pay = (tx: Session, invoiceId: string, amount: number, method = "cash", date = "2026-09-01") =>
    tx.query<{ id: string }>("select public.record_payment($1, $2, $3, $4) as id", [invoiceId, amount, date, method])

  it("partial payment updates balance and status; the rest settles it", async () => {
    const states = await as(db, ids.admin, async (tx) => {
      const invoice = await openInvoice(tx, "HS003") // overdue, nothing paid
      const status = async () =>
        (await tx.query<{ payment_status: string; remaining: string }>(
          "select payment_status, remaining from public.invoice_balances where id = $1",
          [invoice.id]
        )).rows[0]
      const before = await status()
      await pay(tx, invoice.id, 400_000)
      const partial = await status()
      await pay(tx, invoice.id, num(partial.remaining), "bank_transfer")
      return { before, partial, after: await status() }
    })
    expect(states.before.payment_status).toBe("overdue")
    expect(states.partial).toEqual({ payment_status: "overdue", remaining: "1000000" })
    expect(states.after).toEqual({ payment_status: "paid", remaining: "0" })
  })

  it("future invoices with a partial payment are partially paid, untouched ones unpaid", async () => {
    const statuses = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select id from public.invoice_balances where student_code = 'HS003' and due_date > private.academy_today() order by due_date limit 2"
      )
      await pay(tx, rows[0].id, 100_000)
      return column(tx, "select payment_status from public.invoice_balances where id = any($1::uuid[])", [rows.map((r) => r.id)])
    })
    expect(statuses).toEqual(["partially_paid", "unpaid"])
  })

  it("rejects over-payment", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const invoice = await openInvoice(tx, "HS003")
        await pay(tx, invoice.id, num(invoice.remaining) + 1)
      })
    ).rejects.toThrow(/exceeds the remaining balance of 1.400.000|exceeds the remaining balance of 1,400,000/)
  })

  it("rejects future-dated payments and payments on void invoices", async () => {
    await expect(
      as(db, ids.admin, async (tx) => pay(tx, (await openInvoice(tx, "HS003")).id, 1000, "cash", "2099-01-01"))
    ).rejects.toThrow(/cannot be in the future/)
    await expect(
      as(db, ids.admin, async (tx) => {
        const invoice = await openInvoice(tx, "HS003")
        await tx.query("select public.void_invoice($1, 'Issued by mistake')", [invoice.id])
        await pay(tx, invoice.id, 1000)
      })
    ).rejects.toThrow(/void invoice/)
  })

  it("the server sets student, staff member, receipt number and status", async () => {
    const payment = await as(db, ids.admin, async (tx) => {
      const invoice = await openInvoice(tx, "HS003")
      const { rows } = await pay(tx, invoice.id, 1000)
      return (await tx.query<Record<string, string>>(
        "select receipt_number, recorded_by, recorded_by_name, status, student_id from public.payments where id = $1",
        [rows[0].id]
      )).rows[0]
    })
    expect(payment.receipt_number).toMatch(/^PT\d{4}-\d{5}$/)
    expect(payment).toMatchObject({
      recorded_by: ids.admin,
      recorded_by_name: "Nguyễn Thị Thu Trang",
      status: "completed",
      student_id: studentIds.HS003,
    })
  })

  it("forged staff member / student on a direct insert are overwritten", async () => {
    const payment = await as(db, ids.admin, async (tx) => {
      const invoice = await openInvoice(tx, "HS003")
      const { rows } = await tx.query<{ recorded_by: string; student_id: string; status: string }>(
        `insert into public.payments (receipt_number, invoice_id, student_id, amount, paid_on, method, recorded_by, status)
         values ('X', $1, $2, 1000, '2026-09-01', 'cash', $3, 'voided') returning recorded_by, student_id, status`,
        [invoice.id, studentIds.HS001, ids.superAdmin]
      )
      return rows[0]
    })
    expect(payment).toEqual({ recorded_by: ids.admin, student_id: studentIds.HS003, status: "completed" })
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot record payments", async (who) => {
    const invoiceId = (await db.query<{ id: string }>("select id from public.invoices limit 1")).rows[0].id
    await expect(run(who, "select public.record_payment($1, 1000, '2026-09-01', 'cash')", [invoiceId])).rejects.toThrow(
      /permission to record payments/
    )
  })

  it("payments are immutable; voiding needs a reason and restores the balance", async () => {
    await expect(run("admin", "update public.payments set amount = 1")).rejects.toThrow(/permission denied/)
    await expect(run("admin", "delete from public.payments")).rejects.toThrow(/permission denied/)

    const result = await as(db, ids.admin, async (tx) => {
      const paid = (await tx.query<{ id: string; invoice_id: string }>(
        "select p.id, p.invoice_id from public.payments p join public.students s on s.id = p.student_id where s.student_code = 'HS005'"
      )).rows[0]
      const before = (await tx.query<{ remaining: string }>("select remaining from public.invoice_balances where id = $1", [paid.invoice_id])).rows[0]
      await expect(tx.query("select public.void_payment($1, '  ')", [paid.id])).rejects.toThrow(/Give a reason/)
      return { paid, before }
    })
    expect(num(result.before.remaining)).toBe(0)

    const after = await as(db, ids.admin, async (tx) => {
      const paid = (await tx.query<{ id: string; invoice_id: string }>(
        "select p.id, p.invoice_id from public.payments p join public.students s on s.id = p.student_id where s.student_code = 'HS005'"
      )).rows[0]
      await tx.query("select public.void_payment($1, 'Bank transfer bounced')", [paid.id])
      return (await tx.query<{ remaining: string; payment_status: string }>(
        "select remaining, payment_status from public.invoice_balances where id = $1",
        [paid.invoice_id]
      )).rows[0]
    })
    expect(num(after.remaining)).toBe(3_500_000)
    expect(after.payment_status).not.toBe("paid")
  })

  it("a gateway event recorded twice creates one payment", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const invoice = await openInvoice(tx, "HS003")
      const call = () =>
        tx.query<{ id: string }>(
          "select public.record_payment($1, 5000, '2026-09-01', 'other', null, null, 'testpay', 'evt_123') as id",
          [invoice.id]
        )
      const first = (await call()).rows[0].id
      const second = (await call()).rows[0].id
      const count = (await tx.query("select 1 from public.payments where provider = 'testpay'")).rows.length
      return { same: first === second, count }
    })
    expect(result).toEqual({ same: true, count: 1 })
  })
})

describe("invoices and cancellation", () => {
  it("an invoice with payments cannot be voided", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const { rows } = await tx.query<{ invoice_id: string }>("select invoice_id from public.payments limit 1")
        await tx.query("select public.void_invoice($1, 'test')", [rows[0].invoice_id])
      })
    ).rejects.toThrow(/Void the payments first/)
  })

  it("invoice numbers are generated and ad-hoc invoices must match the tuition's student", async () => {
    const number = await as(db, ids.admin, async (tx) =>
      (await tx.query<{ invoice_number: string }>(
        "insert into public.invoices (student_id, description, amount, due_date) values ($1, 'Giáo trình', 250000, private.academy_today() + 7) returning invoice_number",
        [studentIds.HS004]
      )).rows[0].invoice_number
    )
    expect(number).toMatch(/^HD\d{4}-\d{5}$/)

    await expect(
      as(db, ids.admin, async (tx) => {
        const tuition = (await tx.query<{ id: string }>(
          "select t.id from public.student_tuitions t join public.students s on s.id = t.student_id where s.student_code = 'HS001'"
        )).rows[0].id
        await tx.query(
          "insert into public.invoices (student_id, student_tuition_id, description, amount, due_date) values ($1, $2, 'x', 1000, private.academy_today())",
          [studentIds.HS002, tuition]
        )
      })
    ).rejects.toThrow(/must match the tuition student/)
  })

  it("cancelling tuition voids unpaid invoices and keeps paid ones", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const tuition = (await tx.query<{ id: string }>(
        "select t.id from public.student_tuitions t join public.students s on s.id = t.student_id where s.student_code = 'HS001'"
      )).rows[0].id
      await tx.query("select public.cancel_tuition($1, 'Chuyển trường')", [tuition])
      const statuses = await column(tx, "select payment_status from public.invoice_balances where student_tuition_id = $1", [tuition])
      const summary = (await tx.query<{ payment_status: string; remaining: string }>(
        "select payment_status, remaining from public.student_tuition_balances where id = $1",
        [tuition]
      )).rows[0]
      return { statuses, summary }
    })
    expect(result.statuses.filter((s) => s === "paid")).toHaveLength(2)
    expect(result.statuses.filter((s) => s === "void")).toHaveLength(7)
    expect(result.summary).toEqual({ payment_status: "cancelled", remaining: "0" })
  })

  it("seeded balances are consistent", async () => {
    const { rows } = await run(
      "admin",
      "select student_code, payment_status, final_amount, paid, remaining from public.student_tuition_balances order by student_code"
    )
    expect(rows.map((r) => ({ ...(r as Record<string, string>) }))).toEqual([
      { student_code: "HS001", payment_status: "partially_paid", final_amount: "12600000", paid: "2800000", remaining: "9800000" },
      { student_code: "HS002", payment_status: "overdue", final_amount: "13500000", paid: "2000000", remaining: "11500000" },
      { student_code: "HS003", payment_status: "overdue", final_amount: "12600000", paid: "0", remaining: "12600000" },
      { student_code: "HS005", payment_status: "partially_paid", final_amount: "14000000", paid: "3500000", remaining: "10500000" },
    ])
  })
})
