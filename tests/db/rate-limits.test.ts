import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, userId, type Session, type TestDb } from "./harness"

let db: TestDb
const ids: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries({ ha: "gv.ha@bsmart.test", lan: "ph.lan@bsmart.test", admin: "admin@bsmart.test" })) ids[who] = await userId(db, email)
})

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

describe("communication rate limits", () => {
  it("30 messages per 10 minutes per sender", async () => {
    await as(db, ids.lan, async (tx) => {
      const thread = (await tx.query<{ id: string }>("select id from public.message_threads")).rows[0].id
      // The seed already has one message from Lan.
      for (let i = 0; i < 29; i++) await tx.query("insert into public.messages (thread_id, body) values ($1, $2)", [thread, `Tin nhắn ${i}`])
      await rejects(tx, "insert into public.messages (thread_id, body) values ($1, 'one too many')", [thread], /sending messages very quickly/)
    })
  })

  it("20 announcements a day for teachers; administrators are not limited", async () => {
    await as(db, ids.ha, async (tx) => {
      const fly = (await tx.query<{ id: string }>("select id from public.classes where code = 'FLY-2026A'")).rows[0].id
      for (let i = 0; i < 19; i++) await tx.query("insert into public.announcements (audience, class_id, title, body) values ('class', $1, $2, 'x')", [fly, `Thông báo ${i}`])
      await rejects(tx, "insert into public.announcements (audience, class_id, title, body) values ('class', $1, 'x', 'x')", [fly], /20 announcements today/)
    })
    await as(db, ids.admin, async (tx) => {
      for (let i = 0; i < 25; i++) await tx.query("insert into public.announcements (audience, title, body) values ('staff', $1, 'x')", [`Admin ${i}`])
    })
  })
})
