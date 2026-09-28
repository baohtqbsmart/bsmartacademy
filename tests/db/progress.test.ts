import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // teaches TOAN6-2026A
  huy: "hs.huy@bsmart.test", // HS001, TOAN6-2026A
  chau: "hs.chau@bsmart.test", // HS003, TOAN6-2026A
  lan: "ph.lan@bsmart.test", // mother of HS001
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
let toan: { id: string; course_id: string }
let fly: { id: string; course_id: string }
let huyStudent: string

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  toan = (await db.query<{ id: string; course_id: string }>("select id, course_id from public.classes where code = 'TOAN6-2026A'")).rows[0]
  fly = (await db.query<{ id: string; course_id: string }>("select id, course_id from public.classes where code = 'FLY-2026A'")).rows[0]
  huyStudent = (await db.query<{ id: string }>("select id from public.students where student_code = 'HS001'")).rows[0].id
})

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

async function unit(tx: Session, courseId: string, position = 1) {
  return (
    await tx.query<{ id: string }>("insert into public.course_units (course_id, position, title) values ($1, $2, 'Module') returning id", [courseId, position])
  ).rows[0].id
}

describe("modules", () => {
  it("course editors place lessons in a module; students of the course see them; teachers cannot edit", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      const u = await unit(tx, toan.course_id)
      const [{ id: lesson }] = (await tx.query<{ id: string }>("select id from public.lessons limit 1")).rows
      await tx.query("insert into public.unit_lessons (unit_id, lesson_id) values ($1, $2)", [u, lesson])
      await switchUser(tx, ids.huy)
      const student = await column(tx, "select lesson_id from public.unit_lessons where unit_id = $1", [u])
      await switchUser(tx, ids.hung)
      await rejects(tx, "insert into public.unit_lessons (unit_id, lesson_id) values ($1, $2)", [u, lesson], /row-level security|duplicate/)
      return student
    })
    expect(seen).toHaveLength(1)
  })

  it("an assignment's module must belong to its class's course", async () => {
    await as(db, ids.admin, async (tx) => {
      const own = await unit(tx, toan.course_id)
      const other = await unit(tx, fly.course_id)
      const [{ id }] = (await tx.query<{ id: string }>("select id from public.assignments where class_id = $1 limit 1", [toan.id])).rows
      await tx.query("update public.assignments set unit_id = $1 where id = $2", [own, id])
      await rejects(tx, "update public.assignments set unit_id = $1 where id = $2", [other, id], /module of this class/)
    })
  })
})

describe("learning days", () => {
  it("counts a student's own activity; other students see nothing of it", async () => {
    await db.query(
      "insert into public.vocabulary_practice (student_id, word_id, activity, correct, created_at) select $1, id, 'flashcards', true, now() from public.vocabulary_words limit 1",
      [huyStudent]
    ).catch(() => undefined)
    const own = await as(db, ids.huy, (tx) => column(tx, "select day from public.learning_days($1, date '2000-01-01')", [huyStudent]))
    const other = await as(db, ids.chau, (tx) => column(tx, "select day from public.learning_days($1, date '2000-01-01')", [huyStudent]))
    const parent = await as(db, ids.lan, (tx) => column(tx, "select day from public.learning_days($1, date '2000-01-01')", [huyStudent]))
    expect(own.length).toBeGreaterThan(0)
    expect(parent).toEqual(own)
    expect(other).toEqual([])
  })
})

describe("certificates", () => {
  it("administrators issue them; the database fills in number, names and issuer", async () => {
    const cert = await as(db, ids.admin, async (tx) =>
      (
        await tx.query<Record<string, unknown>>(
          "insert into public.certificates (student_id, class_id, student_name, course_name, class_name, certificate_no, verify_code) values ($1, $2, 'Fake', 'Fake', 'Fake', 'X', 'x') returning *",
          [huyStudent, toan.id]
        )
      ).rows[0]
    )
    expect(cert.certificate_no).toMatch(/^BSA-\d{4}-\d{5}$/)
    expect(cert.verify_code).toMatch(/^[0-9a-f]{18}$/)
    expect(cert.student_name).not.toBe("Fake")
    expect(cert.class_name).toBe("Toán 6 nâng cao – 2026A")
    expect(cert.issued_by).toBe(ids.admin)
  })

  it("only for enrolled students, once per class, and only by administrators", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.query("insert into public.certificates (student_id, class_id) values ($1, $2)", [huyStudent, toan.id])
      await rejects(tx, "insert into public.certificates (student_id, class_id) values ($1, $2)", [huyStudent, toan.id], /already has a certificate/)
      await rejects(tx, "insert into public.certificates (student_id, class_id) values ($1, $2)", [huyStudent, fly.id], /not enrolled/)
    })
    await as(db, ids.hung, (tx) => rejects(tx, "insert into public.certificates (student_id, class_id) values ($1, $2)", [huyStudent, toan.id], /row-level security/))
  })

  it("the student and their parents see it; other students do not; it can be revoked but not edited or deleted", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      const [{ id }] = (await tx.query<{ id: string }>("insert into public.certificates (student_id, class_id) values ($1, $2) returning id", [huyStudent, toan.id])).rows
      await rejects(tx, "update public.certificates set student_name = 'Someone else' where id = $1", [id], /permission denied/)
      await rejects(tx, "delete from public.certificates where id = $1", [id], /permission denied/)
      const visible: Record<string, number> = {}
      for (const who of ["huy", "lan", "chau"] as const) {
        await switchUser(tx, ids[who])
        visible[who] = (await tx.query("select 1 from public.certificates where id = $1", [id])).rows.length
      }
      await switchUser(tx, ids.admin)
      await tx.query("update public.certificates set revoked_at = now(), revoke_reason = 'Issued by mistake' where id = $1", [id])
      const audit = await column(tx, "select action from public.audit_log where entity_id = $1", [id])
      return { visible, audit }
    })
    expect(seen.visible).toEqual({ huy: 1, lan: 1, chau: 0 })
    expect(seen.audit).toEqual(["certificate.issued", "certificate.revoked"])
  })

  it("anyone can verify a certificate by its code, and sees if it was revoked", async () => {
    const code = await as(db, ids.admin, async (tx) => {
      const [{ id, verify_code }] = (
        await tx.query<{ id: string; verify_code: string }>("insert into public.certificates (student_id, class_id) values ($1, $2) returning id, verify_code", [huyStudent, toan.id])
      ).rows
      await tx.query("update public.certificates set revoked_at = now(), revoke_reason = 'test' where id = $1", [id])
      await tx.exec("reset role")
      await tx.exec("set local role anon")
      await tx.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
      return {
        found: (await tx.query<{ revoked: boolean; student_name: string }>("select revoked, student_name from public.verify_certificate($1)", [verify_code.toUpperCase()])).rows,
        wrong: (await tx.query("select 1 from public.verify_certificate('nope')")).rows.length,
        table: await tx.query("select 1 from public.certificates").then(() => "readable").catch(() => "denied"),
      }
    })
    expect(code.found).toHaveLength(1)
    expect(code.found[0].revoked).toBe(true)
    expect(code.wrong).toBe(0)
    expect(code.table).toBe("denied")
  })
})
