import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, userId, type TestDb } from "./harness"

// Reports read existing tables through RLS. These checks pin down what each
// role's reports can possibly contain.

const EMAILS = { admin: "admin@bsmart.test", hung: "gv.hung@bsmart.test", ha: "gv.ha@bsmart.test", lan: "ph.lan@bsmart.test", huy: "hs.huy@bsmart.test" } as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
})

const count = (who: Who, sql: string) => as(db, ids[who], async (tx) => (await tx.query(sql)).rows.length)
const codes = (who: Who, sql: string) => as(db, ids[who], async (tx) => (await tx.query<{ code: string }>(sql)).rows.map((r) => r.code).sort())

describe("report data per role", () => {
  it("only administrators and teachers hold reports.read; teachers only for their classes", async () => {
    const { rows } = await db.query<{ role_code: string; scope: string }>("select role_code, scope from public.role_permissions where permission_code = 'reports.read' order by role_code")
    expect(rows).toEqual([
      { role_code: "admin", scope: "all" },
      { role_code: "super_admin", scope: "all" },
      { role_code: "teacher", scope: "assigned" },
    ])
  })

  it("teachers see no financial data at all (tuition report and dashboard figures)", async () => {
    for (const table of ["invoices", "invoice_balances", "payments", "student_tuitions", "tuition_plans"]) {
      expect(await count("hung", `select 1 from public.${table}`), table).toBe(0)
    }
    expect(await count("admin", "select 1 from public.invoice_balances")).toBeGreaterThan(0)
  })

  it("a teacher's class, assignment, test and attendance data is limited to their classes", async () => {
    expect(await codes("hung", "select code from public.classes where deleted_at is null")).toEqual(["TOAN6-2026A"])
    expect(await count("hung", "select 1 from public.assignments a join public.classes c on c.id = a.class_id where c.code <> 'TOAN6-2026A'")).toBe(0)
    expect(await count("hung", "select 1 from public.tests t join public.classes c on c.id = t.class_id where c.code <> 'TOAN6-2026A'")).toBe(0)
    const summary = await as(db, ids.hung, async (tx) =>
      (await tx.query<{ code: string }>("select c.code from public.attendance_summary('2000-01-01', '2100-01-01', 'class') s join public.classes c on c.id = s.group_id")).rows.map((r) => r.code)
    )
    expect(summary).toEqual(["TOAN6-2026A"])
  })

  it("teachers' student lists hold no contact details", async () => {
    // Contact columns are readable only to staff with students.write; reports never select them.
    const visible = await as(db, ids.hung, async (tx) => (await tx.query("select id from public.students where deleted_at is null")).rows.length)
    expect(visible).toBeGreaterThan(0)
    const notes = await as(db, ids.hung, (tx) => tx.query("select notes from public.students limit 1").then(() => "readable", (e: Error) => e.message))
    expect(notes).toMatch(/permission denied/)
  })

  it("families have no report access and see only their own finances", async () => {
    expect(await count("lan", "select 1 from public.role_permissions rp join public.profiles p on p.role_code = rp.role_code where p.id = auth.uid() and rp.permission_code = 'reports.read'")).toBe(0)
    const own = await as(db, ids.lan, async (tx) => (await tx.query<{ student_code: string }>("select distinct student_code from public.invoice_balances")).rows.map((r) => r.student_code).sort())
    expect(own.every((c) => ["HS001", "HS002"].includes(c))).toBe(true)
  })
})
