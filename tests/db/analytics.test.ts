import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán: HS001, HS003, HS006
  ha: "gv.ha@bsmart.test", // Flyers (HS002, HS005) and KET (HS001)
  tuan: "gv.tuan@bsmart.test",
  lan: "ph.lan@bsmart.test", // HS001 + HS002
  duc: "ph.duc@bsmart.test", // HS003
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // HS004
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const studentIds: Record<string, string> = {}
const ALL = ["2000-01-01", "2100-01-01"]

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows) studentIds[r.student_code] = r.id
})

const codes = async (tx: Session, sql: string, params: unknown[] = []) =>
  [...new Set((await tx.query<{ student_id: string }>(sql, params)).rows.map((r) => Object.entries(studentIds).find(([, id]) => id === r.student_id)![0]))].sort()

describe("each role sees only whose results it may", () => {
  it.each([
    ["admin", ["HS001", "HS002", "HS003"]],
    ["huy", ["HS001"]],
    ["chau", ["HS003"]],
    ["khang", []],
    ["lan", ["HS001", "HS002"]],
    ["duc", ["HS003"]],
    ["hung", ["HS001", "HS003"]],
    ["ha", ["HS001", "HS002"]],
  ] as const)("%s → %o", async (who, expected) => {
    const seen = await as(db, ids[who], (tx) => codes(tx, "select student_id from public.progress_results($1, $2)", ALL))
    expect(seen).toEqual([...expected])
  })

  it("asking for someone else's student returns nothing", async () => {
    const rows = await as(db, ids.huy, async (tx) => (await tx.query("select 1 from public.progress_results($1, $2, $3)", [...ALL, studentIds.HS003])).rows.length)
    expect(rows).toBe(0)
  })

  it("homework and vocabulary follow the same rules", async () => {
    expect(await as(db, ids.huy, (tx) => codes(tx, "select student_id from public.homework_completion($1, $2)", ALL))).toEqual(["HS001"])
    expect(await as(db, ids.hung, (tx) => codes(tx, "select student_id from public.homework_completion($1, $2)", ALL))).toEqual(["HS001", "HS003"]) // HS006 is archived: left out for everyone
    expect(await as(db, ids.duc, (tx) => codes(tx, "select student_id from public.vocabulary_mastery()"))).toEqual([])
    expect(await as(db, ids.lan, (tx) => codes(tx, "select student_id from public.vocabulary_mastery()"))).toEqual(["HS001"])
  })

  it("archived students are left out, even for admins", async () => {
    expect(await as(db, ids.admin, (tx) => codes(tx, "select student_id from public.homework_completion($1, $2)", ALL))).not.toContain("HS006")
  })

  it("anonymous callers cannot run the functions", async () => {
    await as(db, null, async (tx) => {
      await tx.exec("savepoint s")
      await expect(tx.query("select * from public.progress_results($1, $2)", ALL)).rejects.toThrow(/permission denied/)
      await tx.exec("rollback to savepoint s")
    })
  })
})

describe("only published results count", () => {
  const toan = (tx: Session, who: string) =>
    tx.query<{ source: string; raw_score: string; max_score: string; percent: string; assessed_by: string }>(
      "select source, raw_score, max_score, percent, assessed_by from public.progress_results($1, $2, $3, $4) where source = 'assignment'",
      [...ALL, studentIds[who], classIds["TOAN6-2026A"]]
    )

  it("a graded but unreturned assignment is invisible, even to its teacher and admins, until returned", async () => {
    await as(db, ids.hung, async (tx) => {
      expect((await toan(tx, "HS003")).rows).toHaveLength(0)
      expect((await toan(tx, "HS001")).rows).toEqual([{ source: "assignment", raw_score: "9.50", max_score: "10.00", percent: "95.0", assessed_by: "teacher" }])
      const assignment = (await tx.query<{ id: string }>("select id from public.assignments where title = 'Bài tập Phân số – tuần 3'")).rows[0].id
      await tx.query("select public.return_grades($1)", [assignment])
      expect((await toan(tx, "HS003")).rows).toHaveLength(1)
    })
    await as(db, ids.admin, async (tx) => expect((await toan(tx, "HS003")).rows).toHaveLength(0))
  })

  it("IELTS-style bands are reported as bands, never as percentages", async () => {
    const row = await as(db, ids.admin, async (tx) => {
      await tx.exec("reset role")
      await tx.exec("set local session_replication_role = replica")
      await tx.query("update public.assessment_tasks set scoring = 'ielts_band', max_score = 9 where title = 'Email to a friend'")
      await tx.query("update public.assessment_grades set total_score = 6.5 where total_score = 15")
      await tx.exec("set local session_replication_role = origin")
      await tx.exec("set local role authenticated")
      return (await tx.query("select raw_score, max_score, percent, band from public.progress_results($1, $2) where source = 'assessment'", ALL)).rows
    })
    expect(row).toEqual([{ raw_score: "6.50", max_score: "9.00", percent: null, band: "6.50" }])
  })

  it("dates and classes filter results; a class includes its students' own English practice", async () => {
    await as(db, ids.ha, async (tx) => {
      const recent = (await tx.query("select 1 from public.progress_results(current_date - 30, current_date, $1)", [studentIds.HS002])).rows.length
      const all = (await tx.query("select 1 from public.progress_results($1, $2, $3)", [...ALL, studentIds.HS002])).rows.length
      expect(all).toBe(11) // 10 weeks of vocabulary practice + the Flyers email
      expect(recent).toBeGreaterThanOrEqual(4)
      expect(recent).toBeLessThan(all)
      const fly = await codes(tx, "select student_id from public.progress_results($1, $2, null, $3)", [...ALL, classIds["FLY-2026A"]])
      expect(fly).toEqual(["HS002"])
    })
  })

  it("a test counts once, with the best graded attempt", async () => {
    const rows = await as(db, ids.hung, async (tx) => {
      // A second, weaker graded attempt by Huy.
      await tx.exec("reset role")
      await tx.exec("set local session_replication_role = replica")
      await tx.query(
        `insert into public.test_attempts (test_id, student_id, attempt_number, status, question_order, submitted_at, score, raw_score, raw_max, graded_at)
         select test_id, student_id, attempt_number + 1, 'graded', question_order, now(), 2, 2, raw_max, now()
         from public.test_attempts where student_id = $1 and status = 'graded' limit 1`,
        [studentIds.HS001]
      )
      await tx.exec("set local session_replication_role = origin")
      await tx.exec("set local role authenticated")
      return (await tx.query<{ raw_score: string }>("select raw_score from public.progress_results($1, $2, $3) where source = 'test'", [...ALL, studentIds.HS001])).rows
    })
    expect(rows).toEqual([{ raw_score: "8.34" }])
  })

  it("archived students' results are left out", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.exec("reset role")
      await tx.query("update public.students set deleted_at = now() where student_code = 'HS001'")
      await tx.exec("set local role authenticated")
      return codes(tx, "select student_id from public.progress_results($1, $2)", ALL)
    })
    expect(seen).toEqual(["HS002", "HS003"])
  })})
