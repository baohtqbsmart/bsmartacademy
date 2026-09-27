import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = { admin: "admin@bsmart.test", hung: "gv.hung@bsmart.test", ha: "gv.ha@bsmart.test", huy: "hs.huy@bsmart.test", lan: "ph.lan@bsmart.test" } as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
})

const one = async (tx: Session, sql: string, params: unknown[] = []) => Object.values((await tx.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0]
async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}
const content = JSON.stringify({ title: "Zoo", objectives: ["x"] })
async function draft(tx: Session) {
  const request = await one(tx, "select public.begin_ai_request('lesson')")
  await tx.query("select public.finish_ai_request($1, true, 'anthropic', 'claude-test', null, 100, 200)", [request])
  return (await one(
    tx,
    "insert into public.ai_drafts (task, title, input, content, provider, model, request_id) values ('lesson', 'Zoo', '{\"topic\": \"zoo\"}', $1, 'anthropic', 'claude-test', $2) returning id",
    [content, request]
  )) as string
}

describe("AI drafts", () => {
  it("are private to their teacher (administrators may review); families have no access", async () => {
    await as(db, ids.ha, async (tx) => {
      const id = await draft(tx)
      const seen: Record<string, number> = {}
      for (const who of ["ha", "hung", "admin", "huy", "lan"] as const) {
        await switchUser(tx, ids[who])
        seen[who] = (await tx.query("select 1 from public.ai_drafts where id = $1", [id])).rows.length
      }
      expect(seen).toEqual({ ha: 1, hung: 0, admin: 1, huy: 0, lan: 0 })
      await switchUser(tx, ids.hung)
      expect((await tx.query("update public.ai_drafts set title = 'mine' where id = $1 returning 1", [id])).rows).toHaveLength(0)
    })
    for (const who of ["huy", "lan"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "select public.begin_ai_request('lesson')", [], /do not have access/))
  })

  it("keep the AI's original output and provenance; the teacher edits a copy", async () => {
    await as(db, ids.ha, async (tx) => {
      const id = await draft(tx)
      await tx.query("update public.ai_drafts set content = $2 where id = $1", [id, JSON.stringify({ title: "Edited" })])
      expect(await one(tx, "select original_content->>'title' from public.ai_drafts where id = $1", [id])).toBe("Zoo")
      await rejects(tx, "update public.ai_drafts set original_content = '{}' where id = $1", [id], /permission denied/)
      await rejects(tx, "update public.ai_drafts set model = 'other' where id = $1", [id], /permission denied/)
      await rejects(tx, "update public.ai_drafts set owner_id = $2 where id = $1", [id, ids.hung], /permission denied/)
    })
  })

  it("follow draft → approved → (discarded); approved ones are frozen and cannot go back", async () => {
    await as(db, ids.ha, async (tx) => {
      const id = await draft(tx)
      await rejects(tx, "update public.ai_drafts set saved_to = '[{\"type\": \"design\"}]' where id = $1", [id], /Approve the draft before saving/)
      await tx.query("update public.ai_drafts set status = 'approved' where id = $1", [id])
      expect(await one(tx, "select approved_at is not null and approved_by_name <> '' from public.ai_drafts where id = $1", [id])).toBe(true)
      await rejects(tx, "update public.ai_drafts set content = '{}' where id = $1", [id], /cannot be edited/)
      await rejects(tx, "update public.ai_drafts set status = 'draft' where id = $1", [id], /cannot go from approved to draft/)
      await tx.query("update public.ai_drafts set saved_to = '[{\"type\": \"design\", \"id\": \"x\"}]' where id = $1", [id])
      await tx.query("update public.ai_drafts set status = 'discarded' where id = $1", [id])
      await rejects(tx, "update public.ai_drafts set status = 'approved' where id = $1", [id], /cannot go from discarded/)
    })
  })

  it("a new draft always starts as a draft, whatever the client sends", async () => {
    await as(db, ids.ha, (tx) =>
      rejects(tx, "insert into public.ai_drafts (task, title, input, content, provider, model, status) values ('lesson', 'x', '{}', '{}', 'a', 'b', 'approved')", [], /permission denied/)
    )
  })
})

describe("usage limits", () => {
  it("one request at a time, 20 per hour, and requests are logged per person", async () => {
    await as(db, ids.hung, async (tx) => {
      const first = await one(tx, "select public.begin_ai_request('worksheet')")
      await rejects(tx, "select public.begin_ai_request('worksheet')", [], /still running/)
      await tx.query("select public.finish_ai_request($1, false, 'anthropic', 'm', 'rate_limited', 0, 0)", [first])
      for (let i = 0; i < 19; i++) {
        const id = await one(tx, "select public.begin_ai_request('worksheet')")
        await tx.query("select public.finish_ai_request($1, true, 'anthropic', 'm', null, 1, 1)", [id])
      }
      await rejects(tx, "select public.begin_ai_request('worksheet')", [], /20 times in the last hour/)
      expect(await one(tx, "select count(*)::int from public.ai_requests")).toBe(20)
      await rejects(tx, "insert into public.ai_requests (user_id, task) values ($1, 'lesson')", [ids.hung], /permission denied/)
      await switchUser(tx, ids.ha)
      expect(await one(tx, "select count(*)::int from public.ai_requests")).toBe(0)
      // Another teacher is not affected by Hùng's usage.
      expect(await one(tx, "select public.begin_ai_request('worksheet') is not null")).toBe(true)
    })
  })

  it("a request can only be finished by its owner, once", async () => {
    await as(db, ids.hung, async (tx) => {
      const id = await one(tx, "select public.begin_ai_request('lesson')")
      await switchUser(tx, ids.ha)
      await tx.query("select public.finish_ai_request($1, true, 'x', 'y', null, 999, 999)", [id])
      await switchUser(tx, ids.hung)
      expect(await one(tx, "select status from public.ai_requests where id = $1", [id])).toBe("started")
      await tx.query("select public.finish_ai_request($1, true, 'anthropic', 'm', null, 5, 6)", [id])
      await tx.query("select public.finish_ai_request($1, false, 'anthropic', 'm', 'x', 0, 0)", [id])
      expect(await one(tx, "select status || ':' || output_tokens from public.ai_requests where id = $1", [id])).toBe("succeeded:6")
    })
  })
})
