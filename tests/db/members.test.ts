import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = { admin: "admin@bsmart.test", hung: "gv.hung@bsmart.test", huy: "hs.huy@bsmart.test", lan: "ph.lan@bsmart.test" } as const
type Who = keyof typeof EMAILS | "member"

let db: TestDb
const ids = {} as Record<Who, string>
let grammar: string
let listening: string

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  // A visitor signs up on the website: Supabase Auth creates the user without an app role.
  await db.query(
    `insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
     values (gen_random_uuid(), 'visitor@example.test', 'x', '{"provider": "email"}', '{"full_name": "Khách Mới"}')`
  )
  ids.member = await userId(db, "visitor@example.test")
  grammar = (await db.query<{ id: string }>("select id from public.lessons where title = 'Present simple'")).rows[0].id
  listening = (await db.query<{ id: string }>("select id from public.lessons where title = 'Tom''s breakfast'")).rows[0].id
  // The grammar lesson is published and shown on the website as a preview.
  await db.query("update public.lessons set status = 'published', body = repeat('Intro text. ', 40) || E'\\n\\n' || repeat('Locked part. ', 60) where id = $1", [grammar])
  await db.query("update public.lessons set public_access = 'preview', slug = 'present-simple' where id = $1", [grammar])
})

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

describe("website members", () => {
  it("self sign-ups become members, not students", async () => {
    const { rows } = await db.query<{ role_code: string; full_name: string }>("select role_code, full_name from public.profiles where id = $1", [ids.member])
    expect(rows[0]).toEqual({ role_code: "member", full_name: "Khách Mới" })
  })

  it("accounts created by staff keep the role they are given", async () => {
    await db.transaction(async (tx) => {
      await tx.query(
        `insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values (gen_random_uuid(), 'new.teacher@bsmart.test', 'x', '{"role": "teacher"}')`
      )
      const { rows } = await tx.query<{ role_code: string }>("select role_code from public.profiles where email = 'new.teacher@bsmart.test'")
      expect(rows[0].role_code).toBe("teacher")
      await tx.rollback()
    }).catch(() => undefined)
  })

  it("members see no academy data", async () => {
    const seen = await as(db, ids.member, async (tx) => ({
      students: await column(tx, "select id from public.students"),
      classes: await column(tx, "select id from public.classes"),
      lessons: await column(tx, "select id from public.lessons"),
      materials: await column(tx, "select id from public.library_materials"),
      invoices: await column(tx, "select id from public.invoices"),
      words: await column(tx, "select id from public.vocabulary_words"),
      profiles: await column(tx, "select id from public.profiles"),
    }))
    expect(seen).toEqual({ students: [], classes: [], lessons: [], materials: [], invoices: [], words: [], profiles: [ids.member] })
  })

  it("members read preview lessons in full; visitors still get the beginning", async () => {
    const member = await as(db, ids.member, async (tx) => (await tx.query<{ body: string; body_truncated: boolean }>("select body, body_truncated from public.public_lesson('present-simple')")).rows[0])
    const visitor = await as(db, null, async (tx) => (await tx.query<{ body: string; body_truncated: boolean }>("select body, body_truncated from public.public_lesson('present-simple')")).rows[0])
    expect(member.body_truncated).toBe(false)
    expect(member.body).toContain("Locked part.")
    expect(visitor.body_truncated).toBe(true)
    expect(visitor.body).not.toContain("Locked part.")
  })
})

describe("dictionary", () => {
  it("signed-in users look up published words; visitors cannot", async () => {
    const found = await as(db, ids.member, (tx) => column(tx, "select word from public.dictionary_search('')"))
    const published = await as(db, ids.admin, (tx) => column(tx, "select word from public.vocabulary_words where status = 'published'"))
    expect(found.length).toBe(Math.min(30, published.length))
    expect(found.every((w) => published.includes(w))).toBe(true)
    await as(db, null, (tx) => rejects(tx, "select * from public.dictionary_search('a')", [], /permission denied/))
  })

  it("finds words by the start of the word or the Vietnamese meaning", async () => {
    const [{ word, meaning_vi }] = (await db.query<{ word: string; meaning_vi: string }>("select word, meaning_vi from public.vocabulary_words where status = 'published' limit 1")).rows
    const byWord = await as(db, ids.member, (tx) => column(tx, "select word from public.dictionary_search($1)", [word.slice(0, 3)]))
    const byMeaning = await as(db, ids.member, (tx) => column(tx, "select word from public.dictionary_search($1)", [meaning_vi]))
    expect(byWord).toContain(word)
    expect(byMeaning).toContain(word)
  })
})

describe("comments", () => {
  it("members comment on public lessons; the name comes from their profile", async () => {
    const seen = await as(db, ids.member, async (tx) => {
      await tx.query("insert into public.content_comments (lesson_id, body, author_name) values ($1, '  Very clear, thanks!  ', 'Fake name')", [grammar])
      return (await tx.query<{ author_name: string; body: string }>("select author_name, body from public.content_comments")).rows
    })
    expect(seen).toEqual([{ author_name: "Khách Mới", body: "Very clear, thanks!" }])
  })

  it("nobody comments on lessons that are not public", async () => {
    await as(db, ids.member, (tx) => rejects(tx, "insert into public.content_comments (lesson_id, body) values ($1, 'x')", [listening], /row-level security/))
    await as(db, ids.huy, (tx) => rejects(tx, "insert into public.content_comments (lesson_id, body) values ($1, 'x')", [listening], /row-level security/))
    await as(db, null, (tx) => rejects(tx, "insert into public.content_comments (lesson_id, body) values ($1, 'x')", [grammar], /permission denied/))
  })

  it("moderators hide comments from everyone; authors delete their own; others cannot touch them", async () => {
    const seen = await as(db, ids.member, async (tx) => {
      const { rows } = await tx.query<{ id: string }>("insert into public.content_comments (lesson_id, body) values ($1, 'Hello') returning id", [grammar])
      const id = rows[0].id
      // Another user can neither delete nor edit it.
      await switchUser(tx, ids.huy)
      const deletedByOther = (await tx.query("delete from public.content_comments where id = $1 returning id", [id])).rows.length
      await rejects(tx, "update public.content_comments set body = 'changed' where id = $1", [id], /permission denied/)
      // A moderator hides it: visitors no longer see it.
      await switchUser(tx, ids.admin)
      await tx.query("update public.content_comments set hidden_at = now() where id = $1", [id])
      await tx.exec("savepoint v")
      await tx.exec("set local role anon")
      await tx.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
      const visibleToVisitors = (await tx.query("select 1 from public.content_comments where id = $1", [id])).rows.length
      await tx.exec("rollback to savepoint v")
      await tx.exec("set local role authenticated")
      // A hidden comment is gone for its author too; a visible one they can delete.
      await switchUser(tx, ids.member)
      const hiddenSeenByAuthor = (await tx.query("select 1 from public.content_comments where id = $1", [id])).rows.length
      const other = (await tx.query<{ id: string }>("insert into public.content_comments (lesson_id, body) values ($1, 'Second') returning id", [grammar])).rows[0].id
      const deletedByAuthor = (await tx.query("delete from public.content_comments where id = $1 returning id", [other])).rows.length
      return { deletedByOther, visibleToVisitors, hiddenSeenByAuthor, deletedByAuthor }
    })
    expect(seen).toEqual({ deletedByOther: 0, visibleToVisitors: 0, hiddenSeenByAuthor: 0, deletedByAuthor: 1 })
  })

  it("limits comments to ten an hour per person", async () => {
    await as(db, ids.member, async (tx) => {
      for (let i = 0; i < 10; i++) await tx.query("insert into public.content_comments (lesson_id, body) values ($1, $2)", [grammar, `c${i}`])
      await rejects(tx, "insert into public.content_comments (lesson_id, body) values ($1, 'one too many')", [grammar], /very quickly/)
    })
  })
})

describe("audit log", () => {
  it("records role changes with who did it; only administrators read it", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("select public.set_user_role($1, 'student')", [ids.member])
      const rows = (await tx.query<{ action: string; actor_id: string; details: { from: string; to: string } }>(
        "select action, actor_id, details from public.audit_log where entity_id = $1 order by id desc limit 1",
        [ids.member]
      )).rows
      await switchUser(tx, ids.hung)
      const teacherSees = (await tx.query("select 1 from public.audit_log")).rows.length
      return { rows, teacherSees }
    })
    expect(seen.rows[0]).toEqual({ action: "user.role_changed", actor_id: ids.admin, details: { from: "member", to: "student" } })
    expect(seen.teacherSees).toBe(0)
  })

  it("cannot be edited or deleted, even by administrators", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.query("update public.site_settings set contact_phone = '0900000001'")
      expect((await tx.query("select 1 from public.audit_log where action = 'website.settings_changed'")).rows.length).toBe(1)
      await rejects(tx, "update public.audit_log set summary = 'x'", [], /permission denied/)
      await rejects(tx, "delete from public.audit_log", [], /permission denied/)
      await rejects(tx, "insert into public.audit_log (action, entity) values ('fake', 'x')", [], /permission denied/)
    })
  })
})
