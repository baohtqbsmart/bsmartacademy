import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, userId, type Session, type TestDb } from "./harness"

const EMAILS = { admin: "admin@bsmart.test", hung: "gv.hung@bsmart.test", huy: "hs.huy@bsmart.test", lan: "ph.lan@bsmart.test" } as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
})

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

describe("public website", () => {
  it("visitors read the catalogue of live subjects and active courses only", async () => {
    const seen = await as(db, null, async (tx) => ({
      subjects: await column(tx, "select code from public.website_subjects()"),
      courses: await column(tx, "select code from public.website_courses()"),
    }))
    const live = await as(db, ids.admin, async (tx) => ({
      subjects: await column(tx, "select code from public.subjects where deleted_at is null"),
      courses: await column(tx, "select code from public.courses where status = 'active' and deleted_at is null"),
    }))
    expect(seen.subjects).toEqual(live.subjects)
    expect(seen.courses).toEqual(live.courses)
    expect(seen.courses.length).toBeGreaterThan(0)
  })

  it("hides subjects taken off the website, and their courses", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      const [{ id, code }] = (await tx.query<{ id: string; code: string }>("select id, code from public.subjects where deleted_at is null order by code limit 1")).rows
      await tx.query("select public.set_subject_website($1, 'Lớp 6 – 12', 'calculator', null, false)", [id])
      await tx.exec("reset role")
      await tx.exec("set local role anon")
      await tx.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
      return {
        code,
        subjects: await column(tx, "select code from public.website_subjects()"),
        courseSubjects: await column(tx, "select distinct subject_id from public.website_courses()"),
        id,
      }
    })
    expect(seen.subjects).not.toContain(seen.code)
    expect(seen.courseSubjects).not.toContain(seen.id)
  })

  it("visitors cannot read tables directly or change anything", async () => {
    await as(db, null, async (tx) => {
      expect((await tx.query("select 1 from public.site_settings")).rows).toHaveLength(1)
      await rejects(tx, "select 1 from public.subjects", [], /permission denied/)
      await rejects(tx, "update public.site_settings set contact_email = 'x@y.vn'", [], /permission denied/)
      await rejects(tx, "insert into public.testimonials (author_name, quote) values ('A', 'B')", [], /permission denied/)
      await rejects(tx, "select public.set_subject_website(gen_random_uuid(), '', 'book', null, true)", [], /permission denied/)
    })
  })

  it("only published testimonials are public", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("insert into public.testimonials (author_name, quote, is_published) values ('Shown', 'Great', true), ('Hidden', 'Draft', false)")
      const admin = await column(tx, "select author_name from public.testimonials")
      await tx.exec("reset role")
      await tx.exec("set local role anon")
      await tx.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
      return { admin, anon: await column(tx, "select author_name from public.testimonials") }
    })
    expect(seen.admin).toEqual(["Hidden", "Shown"])
    expect(seen.anon).toEqual(["Shown"])
  })

  it.each(["hung", "huy", "lan"] as const)("%s cannot edit the website", async (who) => {
    await as(db, ids[who], async (tx) => {
      const { rows } = await tx.query("update public.site_settings set contact_phone = '0900000000' returning id")
      expect(rows).toHaveLength(0)
      await rejects(tx, "insert into public.testimonials (author_name, quote) values ('A', 'B')", [], /row-level security/)
      await rejects(tx, "select public.set_subject_website(id, '', 'book', null, true) from public.subjects limit 1", [], /permission/)
    })
  })

  it("administrators edit contact details and subject presentation", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.site_settings set contact_email = 'hello@bsmart.test', facebook_url = 'https://facebook.com/bsmart'")
      const [{ id }] = (await tx.query<{ id: string }>("select id from public.subjects where deleted_at is null limit 1")).rows
      await tx.query("select public.set_subject_website($1, 'Lớp 6 – 12', 'atom', 'subjects/a.webp', true)", [id])
      return {
        email: (await tx.query<{ contact_email: string }>("select contact_email from public.site_settings")).rows[0].contact_email,
        subject: (await tx.query("select audience, icon, image_path from public.website_subjects() where id = $1", [id])).rows[0],
      }
    })
    expect(seen).toEqual({ email: "hello@bsmart.test", subject: { audience: "Lớp 6 – 12", icon: "atom", image_path: "subjects/a.webp" } })
  })

  it("rejects links that are not https", async () => {
    await as(db, ids.admin, async (tx) => {
      await rejects(tx, "update public.site_settings set zalo_url = 'http://zalo.me/x'", [], /check constraint/)
    })
  })
})
