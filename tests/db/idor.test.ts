import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, userId, type TestDb } from "./harness"

/**
 * Cross-cutting ID-manipulation check. Whatever id a caller puts in a URL or
 * request, the database only returns rows they are entitled to. For every
 * table that references a student and every non-admin role, each visible row
 * must belong to a student that role may see; per-user tables must return
 * only the caller's own rows.
 */

let db: TestDb
let studentTables: string[] = []
let userTables: string[] = []
const people: Record<string, { email: string; id?: string; allowed?: Set<string> }> = {
  huy: { email: "hs.huy@bsmart.test" },
  chau: { email: "hs.chau@bsmart.test" },
  khang: { email: "hs.khang@bsmart.test" },
  lan: { email: "ph.lan@bsmart.test" },
  duc: { email: "ph.duc@bsmart.test" },
  hung: { email: "gv.hung@bsmart.test" },
  ha: { email: "gv.ha@bsmart.test" },
  tuan: { email: "gv.tuan@bsmart.test" },
}

beforeAll(async () => {
  db = await createTestDb()
  const cols = async (column: string) =>
    (
      await db.query<{ t: string }>(
        `select c.table_name as t from information_schema.columns c join pg_class k on k.relname = c.table_name and k.relkind = 'r'
         where c.table_schema = 'public' and c.column_name = $1 order by 1`,
        [column]
      )
    ).rows.map((r) => r.t)
  studentTables = await cols("student_id")
  userTables = await cols("user_id")

  // Who each person is entitled to, computed independently of the policies.
  const set = async (sql: string, params: unknown[]) => new Set((await db.query<{ id: string }>(sql, params)).rows.map((r) => r.id))
  for (const p of Object.values(people)) {
    p.id = await userId(db, p.email)
    const role = (await db.query<{ role_code: string }>("select role_code from public.profiles where id = $1", [p.id])).rows[0].role_code
    p.allowed =
      role === "student"
        ? await set("select id from public.students where profile_id = $1", [p.id])
        : role === "parent"
          ? await set("select sp.student_id as id from public.student_parents sp join public.parents pa on pa.id = sp.parent_id where pa.profile_id = $1", [p.id])
          : // Teachers: every student ever enrolled in a class they teach (class history included).
            await set(
              "select distinct e.student_id as id from public.enrollments e join public.class_members cm on cm.class_id = e.class_id join public.teachers t on t.id = cm.teacher_id where t.profile_id = $1",
              [p.id]
            )
  }
})

describe("no role reads another family's student rows", () => {
  it("covers the expected tables", () => {
    expect(studentTables.length).toBeGreaterThanOrEqual(18)
    expect(userTables).toEqual(expect.arrayContaining(["notifications", "notification_preferences", "library_favorites", "ai_requests"]))
  })

  it.each(Object.keys(people))("%s", async (name) => {
    const p = people[name]
    const leaks = await as(db, p.id!, async (tx) => {
      const found: string[] = []
      for (const table of studentTables) {
        await tx.exec("savepoint s")
        try {
          const { rows } = await tx.query<{ student_id: string }>(`select distinct student_id from public.${table}`)
          for (const r of rows) if (r.student_id && !p.allowed!.has(r.student_id)) found.push(`${table}:${r.student_id}`)
        } catch (error) {
          // Column-level revokes (no select on the table) are fine: nothing is readable.
          if (!/permission denied/.test((error as Error).message)) throw error
        }
        await tx.exec("rollback to savepoint s")
      }
      return found
    })
    expect(leaks).toEqual([])
  })
})

describe("per-user tables return only the caller's rows", () => {
  it.each(Object.keys(people))("%s", async (name) => {
    const p = people[name]
    const foreign = await as(db, p.id!, async (tx) => {
      const found: string[] = []
      for (const table of userTables) {
        const { rows } = await tx.query<{ user_id: string }>(`select distinct user_id from public.${table}`)
        for (const r of rows) if (r.user_id !== p.id) found.push(`${table}:${r.user_id}`)
      }
      return found
    })
    expect(foreign).toEqual([])
  })

  it("every non-admin sees exactly one profile: their own", async () => {
    for (const p of Object.values(people)) {
      const ids = await as(db, p.id!, async (tx) => (await tx.query<{ id: string }>("select id from public.profiles")).rows.map((r) => r.id))
      expect(ids).toEqual([p.id])
    }
  })

  it("anonymous callers read nothing anywhere", async () => {
    const tables = (await db.query<{ t: string }>(`select relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind in ('r', 'v') order by 1`)).rows.map((r) => r.t)
    const readable = await as(db, null, async (tx) => {
      const found: string[] = []
      for (const t of tables) {
        await tx.exec("savepoint s")
        try {
          if ((await tx.query(`select 1 from public.${t} limit 1`)).rows.length) found.push(t)
        } catch {
          /* permission denied: expected */
        }
        await tx.exec("rollback to savepoint s")
      }
      return found
    })
    expect(readable).toEqual([])
  })
})
