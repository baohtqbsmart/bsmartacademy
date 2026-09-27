import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, userId, type Session, type TestDb } from "./harness"

const EMAILS = { admin: "admin@bsmart.test", hung: "gv.hung@bsmart.test", huy: "hs.huy@bsmart.test" } as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
let reading: string
let grammar: string

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  reading = (await db.query<{ id: string }>("select id from public.lessons where title = 'Tom''s family'")).rows[0].id
  grammar = (await db.query<{ id: string }>("select id from public.lessons where title = 'Present simple'")).rows[0].id
})

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

/** Runs `fn` as an administrator who publishes, then continues as a visitor. */
async function asVisitorAfter<T>(setup: (tx: Session) => Promise<void>, fn: (tx: Session) => Promise<T>) {
  return as(db, ids.admin, async (tx) => {
    await setup(tx)
    await tx.exec("reset role")
    await tx.exec("set local role anon")
    await tx.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
    return fn(tx)
  })
}

describe("public lessons", () => {
  it("visitors see nothing until a lesson is opened to the website", async () => {
    const seen = await as(db, null, (tx) => column(tx, "select slug from public.public_lessons()"))
    expect(seen).toEqual([])
  })

  it("a preview shows the beginning only; locked parts never leave the database", async () => {
    const lesson = await asVisitorAfter(
      async (tx) => {
        await tx.query("update public.lessons set body = repeat('Paragraph one is here. ', 20) || E'\\n\\n' || repeat('Secret part two. ', 40) where id = $1", [grammar])
        await tx.query("select public.set_lesson_public($1, 'preview', 'present-simple')", [grammar])
      },
      async (tx) => (await tx.query<Record<string, unknown>>("select * from public.public_lesson('present-simple')")).rows[0]
    )
    expect(lesson.access).toBe("preview")
    expect(lesson.body_truncated).toBe(true)
    expect(String(lesson.body)).not.toContain("Secret part two")
    expect(lesson.form).toBeNull()
    expect(lesson.usage).toBeNull()
    expect(lesson.examples).toHaveLength(2)
    expect(lesson.common_mistakes).toEqual([])
  })

  it("a public lesson is complete", async () => {
    const lesson = await asVisitorAfter(
      (tx) => tx.query("select public.set_lesson_public($1, 'public', 'present-simple')", [grammar]).then(() => undefined),
      async (tx) => (await tx.query<Record<string, unknown>>("select * from public.public_lesson('present-simple')")).rows[0]
    )
    expect(lesson.body_truncated).toBe(false)
    expect(lesson.form).not.toBeNull()
    expect(lesson.examples).toHaveLength(3)
  })

  it("draft lessons stay hidden even when opened", async () => {
    const seen = await asVisitorAfter(
      async (tx) => {
        await tx.query("select public.set_lesson_public($1, 'public', 'tom-family')", [reading])
        await tx.query("update public.lessons set status = 'draft' where id = $1", [reading])
      },
      (tx) => column(tx, "select slug from public.public_lessons()")
    )
    expect(seen).not.toContain("tom-family")
  })

  it("visitors cannot read the lessons table", async () => {
    await as(db, null, (tx) => rejects(tx, "select 1 from public.lessons", [], /permission denied/))
  })

  it("only site editors open content, with a unique web address", async () => {
    await as(db, ids.hung, (tx) => rejects(tx, "select public.set_lesson_public($1, 'public', 'x')", [grammar], /permission/))
    await as(db, ids.huy, (tx) => rejects(tx, "select public.set_lesson_public($1, 'public', 'x')", [grammar], /permission/))
    await as(db, null, (tx) => rejects(tx, "select public.set_lesson_public($1, 'public', 'x')", [grammar], /permission denied/))
    await as(db, ids.admin, async (tx) => {
      await rejects(tx, "select public.set_lesson_public($1, 'public', null)", [grammar], /web address/)
      await rejects(tx, "select public.set_lesson_public($1, 'public', 'Bad Slug')", [grammar], /check constraint/)
      await tx.query("select public.set_lesson_public($1, 'public', 'same')", [grammar])
      await rejects(tx, "select public.set_lesson_public($1, 'public', 'same')", [reading], /already used/)
    })
  })
})

describe("public materials", () => {
  /** An administrator uploads a PDF to the library (as the app does). */
  async function anyMaterial(tx: Session) {
    const path = `library/${ids.admin}/${crypto.randomUUID()}.pdf`
    await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 4096, mimetype: "application/pdf" })])
    return (
      await tx.query<{ id: string; object_path: string }>(
        "insert into public.library_materials (title, object_path, file_name, mime_type, size_bytes) values ('Worksheet', $1, 'worksheet.pdf', 'application/pdf', 4096) returning id, object_path",
        [path]
      )
    ).rows[0]
  }

  it("a preview material is listed but its file stays locked", async () => {
    const seen = await asVisitorAfter(
      async (tx) => {
        const m = await anyMaterial(tx)
        await tx.query("select public.set_material_public($1, 'preview')", [m.id])
        await tx.query("select set_config('test.material', $1, true)", [m.id])
      },
      async (tx) => {
        const id = (await tx.query<{ v: string }>("select current_setting('test.material') as v")).rows[0].v
        return {
          listed: (await column(tx, "select id from public.public_materials()")).includes(id),
          file: (await tx.query("select object_path from public.public_material($1)", [id])).rows[0],
        }
      }
    )
    expect(seen.listed).toBe(true)
    expect(seen.file).toEqual({ object_path: null })
  })

  it("a public material gives visitors its file, and storage lets them open exactly that", async () => {
    const seen = await asVisitorAfter(
      async (tx) => {
        const m = await anyMaterial(tx)
        await tx.query("select public.set_material_public($1, 'public')", [m.id])
        await anyMaterial(tx) // a second file that stays members-only
        await tx.query("select set_config('test.material', $1, true)", [m.id])
      },
      async (tx) => {
        const id = (await tx.query<{ v: string }>("select current_setting('test.material') as v")).rows[0].v
        return {
          file: (await tx.query<{ object_path: string | null }>("select object_path from public.public_material($1)", [id])).rows[0].object_path,
          objects: await column(tx, "select name from storage.objects where bucket_id = 'assignment-files'"),
        }
      }
    )
    expect(seen.file).not.toBeNull()
    expect(seen.objects).toEqual([seen.file])
  })
})

describe("public teachers", () => {
  it("only teachers shown on the website appear, without contact details", async () => {
    const seen = await asVisitorAfter(
      async (tx) => {
        const [{ id }] = (await tx.query<{ id: string }>("select id from public.teachers where teacher_code = 'GV001'")).rows
        await tx.query("select public.set_teacher_website($1, 'Ten years of teaching maths.', null, true)", [id])
      },
      async (tx) => (await tx.query<Record<string, unknown>>("select * from public.public_teachers()")).rows
    )
    expect(seen).toHaveLength(1)
    expect(Object.keys(seen[0]).sort()).toEqual(["bio", "full_name", "id", "photo_path", "qualifications", "subjects"])
    expect(seen[0].bio).toBe("Ten years of teaching maths.")
  })

  it("teachers cannot publish themselves", async () => {
    await as(db, ids.hung, (tx) =>
      rejects(tx, "select public.set_teacher_website(id, 'x', null, true) from public.teachers where teacher_code = 'GV001'", [], /permission/)
    )
  })
})

describe("articles", () => {
  it("visitors read published articles only; the date is set on publishing", async () => {
    const seen = await asVisitorAfter(
      async (tx) => {
        await tx.query("insert into public.articles (slug, title, body, status) values ('tips', 'Tips', 'Read daily.', 'published'), ('soon', 'Soon', '', 'draft')")
      },
      async (tx) => (await tx.query<{ slug: string; published_at: string | null; author_name: string }>("select slug, published_at, author_name from public.articles")).rows
    )
    expect(seen.map((a) => a.slug)).toEqual(["tips"])
    expect(seen[0].published_at).not.toBeNull()
    expect(seen[0].author_name).not.toBe("")
  })

  it("only site editors write articles", async () => {
    for (const who of ["hung", "huy"] as const) {
      await as(db, ids[who], (tx) => rejects(tx, "insert into public.articles (slug, title) values ('x', 'X')", [], /row-level security/))
    }
    await as(db, null, (tx) => rejects(tx, "insert into public.articles (slug, title) values ('x', 'X')", [], /permission denied/))
  })
})

describe("private helpers", () => {
  it("visitors can call no private function except the storage check", async () => {
    const callable = await as(db, null, (tx) =>
      column(
        tx,
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')`
      )
    )
    expect(callable).toEqual(["is_public_object"])
  })
})
