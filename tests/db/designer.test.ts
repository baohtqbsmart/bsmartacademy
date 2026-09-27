import { beforeAll, describe, expect, it } from "vitest"

import { DESIGN_ICONS } from "@/features/designer/icons"
import { contentSchema, TEMPLATE_CATEGORIES, type DesignContent } from "@/features/designer/model"

import { as, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  superadmin: "superadmin@bsmart.test",
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test",
  ha: "gv.ha@bsmart.test",
  tuan: "gv.tuan@bsmart.test",
  lan: "ph.lan@bsmart.test",
  huy: "hs.huy@bsmart.test",
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const designIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; title: string }>("select id, title from public.designs")).rows) designIds[r.title] = r.id
})

/** The first column of the first row, as returned. */
const one = async (tx: Session, sql: string, params: unknown[] = []) => Object.values((await tx.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0]

const count = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], async (tx) => (await tx.query(sql, params)).rows.length)

const text = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: "text", x: 10, y: 10, w: 200, h: 50, text: "Hello", fontSize: 24, fontFamily: "sans",
  bold: false, italic: false, underline: false, align: "left", color: "#111111", fill: "transparent", ...extra,
})
const content = (elements: unknown[], extraPages: unknown[] = []): DesignContent =>
  ({ pageSize: "slide", pages: [{ id: "p1", background: "#ffffff", elements }, ...extraPages] }) as DesignContent

async function insertDesign(tx: Session, value: unknown, title = "Test design") {
  return one(tx, "insert into public.designs (title, kind, content) values ($1, 'presentation', $2) returning id", [title, JSON.stringify(value)])
}

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

async function upload(tx: Session, designId: string, ext = "png", mimetype = "image/png") {
  const path = `designs/${designId}/${crypto.randomUUID()}.${ext}`
  await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 2048, mimetype })])
  const assetId = await one(
    tx,
    "insert into public.design_assets (design_id, object_path, file_name, mime_type, size_bytes) values ($1, $2, $3, $4, 2048) returning id",
    [designId, path, `file.${ext}`, mimetype]
  )
  return { path, assetId: assetId as string }
}

// ---------------------------------------------------------------------------

describe("templates", () => {
  it("one or more per category, each valid for the editor and using known icons", async () => {
    const { rows } = await db.query<{ key: string; category: string; content: DesignContent }>("select key, category, content from public.design_templates order by sort_order")
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(TEMPLATE_CATEGORIES))
    for (const row of rows) {
      const parsed = contentSchema.safeParse(row.content)
      expect(parsed.success ? null : `${row.key}: ${parsed.error.issues[0].message}`).toBeNull()
      for (const page of row.content.pages)
        for (const el of page.elements) if (el.type === "icon") expect(DESIGN_ICONS[el.icon], `${row.key} icon ${el.icon}`).toBeDefined()
    }
  })

  it("are readable by designers only and cannot be changed", async () => {
    expect(await count("hung", "select 1 from public.design_templates")).toBe(9)
    expect(await count("admin", "select 1 from public.design_templates")).toBe(9)
    expect(await count("huy", "select 1 from public.design_templates")).toBe(0)
    expect(await count("lan", "select 1 from public.design_templates")).toBe(0)
    await as(db, ids.admin, (tx) => rejects(tx, "update public.design_templates set name = 'x'", [], /permission denied/))
  })
})

describe("who sees and edits designs", () => {
  it.each([
    ["superadmin", 3],
    ["admin", 3],
    ["ha", 2],
    ["hung", 1],
    ["tuan", 0],
    ["huy", 0],
    ["lan", 0],
  ] as const)("%s sees %i designs", async (who, n) => {
    expect(await count(who, "select 1 from public.designs")).toBe(n)
  })

  it("a teacher creates designs as themselves; students and parents cannot", async () => {
    await as(db, ids.tuan, async (tx) => {
      const id = await insertDesign(tx, content([text("a")]))
      expect(await one(tx, "select owner_id from public.designs where id = $1", [id])).toBe(ids.tuan)
      expect(await one(tx, "select version from public.designs where id = $1", [id])).toBe(1)
      await rejects(tx, "insert into public.designs (owner_id, title, kind, content) values ($1, 'x', 'quiz', $2)", [ids.ha, JSON.stringify(content([]))], /permission denied/)
    })
    for (const who of ["huy", "lan"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "insert into public.designs (title, kind, content) values ('x', 'quiz', $1)", [JSON.stringify(content([]))], /row-level security/))
  })

  it("only the owner (or an admin) changes or deletes a design", async () => {
    const hungs = designIds["Phiếu kiểm tra cuối giờ – Phân số"]
    await as(db, ids.ha, async (tx) => {
      expect((await tx.query("update public.designs set title = 'mine' where id = $1 returning id", [hungs])).rows).toHaveLength(0)
      expect((await tx.query("delete from public.designs where id = $1 returning id", [hungs])).rows).toHaveLength(0)
    })
    await as(db, ids.admin, async (tx) => {
      expect((await tx.query("update public.designs set title = 'Checked' where id = $1 returning id", [hungs])).rows).toHaveLength(1)
    })
    await as(db, ids.hung, async (tx) => {
      expect((await tx.query("delete from public.designs where id = $1 returning id", [hungs])).rows).toHaveLength(1)
    })
  })

  it("the version increases on each change and the owner, template and sharing are not client-writable", async () => {
    await as(db, ids.ha, async (tx) => {
      const id = designIds["Past simple – Flyers"]
      const before = (await one(tx, "select version from public.designs where id = $1", [id])) as number
      await tx.query("update public.designs set title = 'Past simple (v2)' where id = $1", [id])
      expect(await one(tx, "select version from public.designs where id = $1", [id])).toBe(before + 1)
      await tx.query("update public.designs set kind = 'quiz' where id = $1", [id])
      expect(await one(tx, "select version from public.designs where id = $1", [id])).toBe(before + 1)
      await rejects(tx, "update public.designs set share_token = gen_random_uuid(), shared_at = now() where id = $1", [id], /permission denied/)
      await rejects(tx, "update public.designs set owner_id = $2 where id = $1", [id, ids.hung], /permission denied/)
    })
  })
})

describe("content validation (same rules as the editor)", () => {
  const page2 = { id: "p2", background: "#ffffff", elements: [] }
  const button = (action: string, target: string | null) => ({ id: "b", type: "button", x: 0, y: 0, w: 100, h: 40, label: "Go", action, target, fill: "#2563eb", color: "#ffffff", fontSize: 20 })
  const question = (extra: Record<string, unknown>) => ({
    id: "q", type: "question", x: 0, y: 0, w: 400, h: 200, questionType: "multiple_choice", prompt: "?", options: ["a", "b"], correct: [0],
    answers: [], explanation: "", fontSize: 20, color: "#111111", fill: "#ffffff", ...extra,
  })

  const valid: [string, DesignContent][] = [
    ["text", content([text("a")])],
    ["button to another page", content([button("page", "p2")], [page2])],
    ["link button", content([button("url", "https://example.test/game")])],
    ["hidden answer", content([text("a", { hidden: true })])],
    ["true/false", content([question({ questionType: "true_false", options: ["True", "False"], correct: [1] })])],
    ["short answer", content([question({ questionType: "short_answer", options: [], correct: [], answers: ["went"] })])],
    ["video link", content([{ id: "v", type: "video", x: 0, y: 0, w: 300, h: 200, assetId: null, url: "https://youtu.be/abcdefghijk", label: "Clip" }])],
    ["table", content([{ id: "t", type: "table", x: 0, y: 0, w: 300, h: 100, rows: [["a", "b"], ["c", "d"]], header: true, fontSize: 16, color: "#111111", borderColor: "#999999", headerFill: "transparent" }])],
  ]
  const invalid: [string, unknown][] = [
    ["unknown element type", content([{ ...text("a"), type: "script" }])],
    ["javascript: link", content([button("url", "javascript:alert(1)")])],
    ["button to a missing page", content([button("page", "nope")])],
    ["duplicate element ids", content([text("a"), text("a")])],
    ["duplicate page ids", { pageSize: "slide", pages: [page2, page2] }],
    ["no pages", { pageSize: "slide", pages: [] }],
    ["unknown page size", { pageSize: "poster", pages: [page2] }],
    ["bad colour", content([text("a", { color: "red; background:url(x)" })])],
    ["huge font", content([text("a", { fontSize: 999 })])],
    ["no correct option", content([question({ correct: [] })])],
    ["correct option out of range", content([question({ correct: [5] })])],
    ["short answer without answers", content([question({ questionType: "short_answer", options: [], correct: [], answers: [" "] })])],
    ["ragged table", content([{ id: "t", type: "table", x: 0, y: 0, w: 300, h: 100, rows: [["a", "b"], ["c"]], header: true, fontSize: 16, color: "#111111", borderColor: "#999999", headerFill: "transparent" }])],
    ["video with neither upload nor link", content([{ id: "v", type: "video", x: 0, y: 0, w: 300, h: 200, assetId: null, url: null, label: "" }])],
    ["too many pages", { pageSize: "slide", pages: Array.from({ length: 61 }, (_, i) => ({ id: `p${i}`, background: "#ffffff", elements: [] })) }],
  ]

  it.each(valid)("accepts %s (editor and database agree)", async (_, value) => {
    expect(contentSchema.safeParse(value).success).toBe(true)
    await as(db, ids.hung, async (tx) => {
      expect(await insertDesign(tx, value)).toBeTruthy()
    })
  })

  it.each(invalid)("rejects %s (editor and database agree)", async (_, value) => {
    expect(contentSchema.safeParse(value).success).toBe(false)
    await as(db, ids.hung, (tx) => rejects(tx, "insert into public.designs (title, kind, content) values ('x', 'quiz', $1)", [JSON.stringify(value)], /./))
  })

  it("pictures must be uploads of the design (a database-only rule)", async () => {
    const orphan = content([{ id: "i", type: "image", x: 0, y: 0, w: 100, h: 100, assetId: crypto.randomUUID(), fit: "cover", radius: 0, alt: "" }])
    await as(db, ids.hung, (tx) => rejects(tx, "insert into public.designs (title, kind, content) values ('x', 'quiz', $1)", [JSON.stringify(orphan)], /picture uploaded to this design/))
  })

  it("an update is validated too", async () => {
    await as(db, ids.ha, (tx) =>
      rejects(tx, "update public.designs set content = $2 where id = $1", [designIds["Past simple – Flyers"], JSON.stringify(content([button("url", "http://insecure.test")]))], /https/)
    )
  })
})

describe("uploads in a design", () => {
  it("the owner uploads pictures, audio and video and places them on pages", async () => {
    await as(db, ids.ha, async (tx) => {
      const design = designIds["Past simple – Flyers"]
      const image = await upload(tx, design)
      const audio = await upload(tx, design, "mp3", "audio/mpeg")
      const pictures = content([
        { id: "i", type: "image", x: 0, y: 0, w: 100, h: 100, assetId: image.assetId, fit: "cover", radius: 0, alt: "A cat" },
        { id: "a", type: "audio", x: 0, y: 200, w: 300, h: 80, assetId: audio.assetId, label: "Listen" },
      ])
      expect(contentSchema.safeParse(pictures).success).toBe(true)
      await tx.query("update public.designs set content = $2 where id = $1", [design, JSON.stringify(pictures)])
      // An audio file cannot stand in for a picture.
      const swapped = content([{ id: "i", type: "image", x: 0, y: 0, w: 100, h: 100, assetId: audio.assetId, fit: "cover", radius: 0, alt: "" }])
      await rejects(tx, "update public.designs set content = $2 where id = $1", [design, JSON.stringify(swapped)], /picture uploaded to this design/)
      // A file still on a page cannot be removed.
      await rejects(tx, "delete from public.design_assets where id = $1", [image.assetId], /still used/)
    })
  })

  it("only images, audio and video; never into someone else's design; never another design's file", async () => {
    await as(db, ids.ha, async (tx) => {
      const design = designIds["Past simple – Flyers"]
      await tx.exec("savepoint pdf")
      await expect(upload(tx, design, "pdf", "application/pdf")).rejects.toThrow(/Only images, audio and video/)
      await tx.exec("rollback to savepoint pdf")
      const image = await upload(tx, design)

      await switchUser(tx, ids.hung)
      await rejects(
        tx,
        "insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')",
        [`designs/${design}/${crypto.randomUUID()}.png`],
        /row-level security/
      )
      // Hùng's own design cannot point at Hà's picture.
      const stolen = content([{ id: "i", type: "image", x: 0, y: 0, w: 100, h: 100, assetId: image.assetId, fit: "cover", radius: 0, alt: "" }])
      await rejects(tx, "insert into public.designs (title, kind, content) values ('x', 'quiz', $1)", [JSON.stringify(stolen)], /uploaded to this design/)
    })
  })

  it("files of an unshared design are private; sharing opens them to signed-in users", async () => {
    const seen = await as(db, ids.ha, async (tx) => {
      const design = designIds["Past simple – Flyers"]
      const { path } = await upload(tx, design)
      const read = async (who: Who) => {
        await switchUser(tx, ids[who])
        return (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      }
      const before = { hung: await read("hung"), huy: await read("huy"), admin: await read("admin"), ha: await read("ha") }
      await tx.query("select public.set_design_sharing($1, 'on')", [design])
      const after = { hung: await read("hung"), huy: await read("huy") }
      return { before, after }
    })
    expect(seen).toEqual({ before: { hung: 0, huy: 0, admin: 1, ha: 1 }, after: { hung: 1, huy: 1 } })
  })
})

describe("share links", () => {
  const shared = (tx: Session, token: string | null) => tx.query("select * from public.shared_design($1)", [token])

  it("the seeded cards are shared: any signed-in user opens them by token, nobody lists them", async () => {
    const token = (await db.query<{ share_token: string }>("select share_token from public.designs where title = 'Flyers Unit 4 – Animal cards'")).rows[0].share_token
    expect(token).toBeTruthy()
    for (const who of ["huy", "lan", "hung"] as const) {
      await as(db, ids[who], async (tx) => {
        expect((await shared(tx, token)).rows).toHaveLength(1)
        expect((await shared(tx, crypto.randomUUID())).rows).toHaveLength(0)
        expect((await shared(tx, null)).rows).toHaveLength(0)
      })
    }
    // Anonymous visitors cannot call it.
    await as(db, null, (tx) => rejects(tx, "select * from public.shared_design($1)", [token], /permission denied/))
  })

  it("the owner turns sharing on, resets and stops it; old links die", async () => {
    await as(db, ids.ha, async (tx) => {
      const id = designIds["Past simple – Flyers"]
      expect((await tx.query("select 1 from public.designs where id = $1 and share_token is null", [id])).rows).toHaveLength(1)
      const first = (await one(tx, "select public.set_design_sharing($1, 'on')", [id])) as string
      expect(await one(tx, "select public.set_design_sharing($1, 'on')", [id])).toBe(first)
      const second = (await one(tx, "select public.set_design_sharing($1, 'reset')", [id])) as string
      expect(second).not.toBe(first)
      await switchUser(tx, ids.huy)
      expect((await shared(tx, first)).rows).toHaveLength(0)
      expect((await shared(tx, second)).rows).toHaveLength(1)
      await switchUser(tx, ids.ha)
      expect(await one(tx, "select public.set_design_sharing($1, 'off')", [id])).toBeNull()
      await switchUser(tx, ids.huy)
      expect((await shared(tx, second)).rows).toHaveLength(0)
    })
  })

  it("nobody else changes sharing", async () => {
    const id = designIds["Past simple – Flyers"]
    for (const who of ["hung", "huy", "tuan"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "select public.set_design_sharing($1, 'on')", [id], /Design not found/))
  })
})
