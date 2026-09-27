import { beforeAll, describe, expect, it } from "vitest"

import { isLibraryMime } from "@/features/library/catalog"

import { as, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán (TOAN6-2026A): Huy HS001, Châu HS003
  ha: "gv.ha@bsmart.test", // Flyers lead
  tuan: "gv.tuan@bsmart.test", // Flyers assistant
  lan: "ph.lan@bsmart.test", // parent of HS001 + HS002
  duc: "ph.duc@bsmart.test", // parent of HS003
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // withdrew from Flyers
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const studentIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows) studentIds[r.student_code] = r.id
})

const one = async (tx: Session, sql: string, params: unknown[] = []) => Object.values((await tx.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0]
const rows = async (tx: Session, sql: string, params: unknown[] = []) => (await tx.query(sql, params)).rows.length

async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
} as const

/** Uploads a file into the caller's library folder and records it. */
async function material(tx: Session, owner: string, fields: Record<string, unknown> = {}, ext: keyof typeof MIME = "pdf") {
  const path = `library/${owner}/${crypto.randomUUID()}.${ext}`
  await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 4096, mimetype: MIME[ext] })])
  const values = { title: "Tài liệu", object_path: path, file_name: `file.${ext}`, mime_type: MIME[ext], size_bytes: 4096, ...fields }
  const keys = Object.keys(values)
  const id = await one(tx, `insert into public.library_materials (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(values))
  return { id: id as string, path }
}

const sees = async (tx: Session, who: Who, materialId: string) => {
  await switchUser(tx, ids[who])
  return rows(tx, "select 1 from public.library_materials where id = $1", [materialId])
}
const readsFile = async (tx: Session, who: Who, path: string) => {
  await switchUser(tx, ids[who])
  return rows(tx, "select 1 from storage.objects where name = $1", [path])
}

// ---------------------------------------------------------------------------

describe("folders", () => {
  it.each([
    ["admin", 9],
    ["ha", 9], // her 3 + 6 academy
    ["hung", 6],
    ["huy", 0],
    ["lan", 0],
  ] as const)("%s sees %i folders", async (who, n) => {
    expect(await as(db, ids[who], (tx) => rows(tx, "select 1 from public.library_folders"))).toBe(n)
  })

  it("teachers make personal folders; only admins make academy folders", async () => {
    await as(db, ids.hung, async (tx) => {
      await tx.query("insert into public.library_folders (scope, name) values ('personal', 'Chương 1')")
      expect(await one(tx, "select owner_id from public.library_folders where name = 'Chương 1'")).toBe(ids.hung)
      await rejects(tx, "insert into public.library_folders (scope, name) values ('academy', 'Mine now')", [], /row-level security/)
      const academy = await one(tx, "select id from public.library_folders where scope = 'academy' limit 1")
      await rejects(tx, "insert into public.library_folders (scope, name, parent_id) values ('personal', 'x', $1)", [academy], /same library/)
    })
    await as(db, ids.admin, (tx) => tx.query("insert into public.library_folders (scope, name) values ('academy', 'IELTS')"))
  })

  it("no cycles and at most five levels", async () => {
    await as(db, ids.hung, async (tx) => {
      let parent: string | null = null
      const chain: string[] = []
      for (let i = 1; i <= 5; i++) {
        parent = (await one(tx, "insert into public.library_folders (scope, name, parent_id) values ('personal', $1, $2) returning id", [`L${i}`, parent])) as string
        chain.push(parent)
      }
      await rejects(tx, "insert into public.library_folders (scope, name, parent_id) values ('personal', 'L6', $1)", [parent], /five levels/)
      await rejects(tx, "update public.library_folders set parent_id = $2 where id = $1", [chain[0], chain[2]], /inside itself/)
    })
  })

  it("only the owner (or an admin) changes a personal folder", async () => {
    const folder = (await db.query<{ id: string }>("select id from public.library_folders where name = 'Flyers 2026A'")).rows[0].id
    await as(db, ids.hung, async (tx) => expect(await rows(tx, "update public.library_folders set name = 'x' where id = $1 returning id", [folder])).toBe(0))
    await as(db, ids.admin, async (tx) => expect(await rows(tx, "update public.library_folders set name = 'Flyers' where id = $1 returning id", [folder])).toBe(1))
  })
})

describe("uploading", () => {
  it("the app and the database accept the same file types", async () => {
    const { rows: types } = await db.query<{ mime_type: string; ok: boolean }>("select mime_type, private.is_library_file_type(mime_type) as ok from public.upload_file_types")
    expect(types.length).toBeGreaterThan(10)
    for (const t of types) expect(isLibraryMime(t.mime_type), t.mime_type).toBe(t.ok)
  })

  it("teachers upload their own files of the accepted kinds; the owner is stamped", async () => {
    await as(db, ids.hung, async (tx) => {
      for (const ext of ["pdf", "docx", "pptx", "png", "mp3", "mp4"] as const) {
        const { id } = await material(tx, ids.hung, { title: `File ${ext}` }, ext)
        expect(await one(tx, "select owner_id from public.library_materials where id = $1", [id])).toBe(ids.hung)
      }
      expect(await one(tx, "select string_agg(file_kind, ',' order by file_kind) from public.library_materials where owner_id = $1", [ids.hung])).toBe(
        "audio,document,image,pdf,presentation,video"
      )
      await tx.exec("savepoint x")
      await expect(material(tx, ids.hung, {}, "xlsx")).rejects.toThrow(/PDF, Word, PowerPoint/)
      await tx.exec("rollback to savepoint x")
    })
  })

  it("nobody records someone else's upload or uploads into someone else's folder", async () => {
    await as(db, ids.hung, async (tx) => {
      const path = `library/${ids.hung}/${crypto.randomUUID()}.pdf`
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 10, mimetype: MIME.pdf })])
      await switchUser(tx, ids.ha)
      await rejects(
        tx,
        "insert into public.library_materials (title, object_path, file_name, mime_type, size_bytes) values ('x', $1, 'a.pdf', 'application/pdf', 10)",
        [path],
        /./
      )
      await rejects(tx, "insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [`library/${ids.hung}/${crypto.randomUUID()}.pdf`], /row-level security/)
    })
    for (const who of ["huy", "lan"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [`library/${ids[who]}/${crypto.randomUUID()}.pdf`], /row-level security/))
  })

  it("the recorded size and type must match the stored file", async () => {
    await as(db, ids.hung, async (tx) => {
      const path = `library/${ids.hung}/${crypto.randomUUID()}.pdf`
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 4096, mimetype: MIME.pdf })])
      await rejects(tx, "insert into public.library_materials (title, object_path, file_name, mime_type, size_bytes) values ('x', $1, 'a.pdf', 'application/pdf', 10)", [path], /./)
    })
  })

  it("only admins publish academy materials", async () => {
    await as(db, ids.hung, async (tx) => {
      await tx.exec("savepoint x")
      await expect(material(tx, ids.hung, { scope: "academy" })).rejects.toThrow(/row-level security/)
      await tx.exec("rollback to savepoint x")
    })
    await as(db, ids.admin, async (tx) => {
      const { id } = await material(tx, ids.admin, { scope: "academy", visibility: "staff" })
      expect(await sees(tx, "hung", id)).toBe(1)
      expect(await sees(tx, "huy", id)).toBe(0)
    })
  })

  it("tags are cleaned; the level must belong to the subject; folders must match", async () => {
    // Read outside the transaction: Hùng cannot see Hà's folder, which is the point.
    const hasFolder = (await db.query<{ id: string }>("select id from public.library_folders where name = 'Flyers 2026A'")).rows[0].id
    await as(db, ids.hung, async (tx) => {
      const { id } = await material(tx, ids.hung, { tags: ["  Phân số ", "phân số", "HK1", ""] })
      expect(await one(tx, "select tags from public.library_materials where id = $1", [id])).toEqual(["hk1", "phân số"])
      const math = await one(tx, "select id from public.subjects where code = 'TOAN'")
      const englishLevel = await one(tx, "select l.id from public.levels l join public.subjects s on s.id = l.subject_id where s.code <> 'TOAN' limit 1")
      if (math && englishLevel) await rejects(tx, "update public.library_materials set subject_id = $2, level_id = $3 where id = $1", [id, math, englishLevel], /level must belong/)
      await rejects(tx, "update public.library_materials set folder_id = $2 where id = $1", [id, hasFolder], /same library/)
    })
  })
})

describe("who sees a material", () => {
  it("private: only its owner and admins; staff: every teacher, never students", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id, path } = await material(tx, ids.hung)
      expect({ ha: await sees(tx, "ha", id), admin: await sees(tx, "admin", id), huy: await sees(tx, "huy", id), hung: await sees(tx, "hung", id) }).toEqual({ ha: 0, admin: 1, huy: 0, hung: 1 })
      expect({ ha: await readsFile(tx, "ha", path), huy: await readsFile(tx, "huy", path) }).toEqual({ ha: 0, huy: 0 })
      await switchUser(tx, ids.hung)
      await tx.query("update public.library_materials set visibility = 'staff' where id = $1", [id])
      expect({ ha: await sees(tx, "ha", id), huy: await sees(tx, "huy", id), lan: await sees(tx, "lan", id) }).toEqual({ ha: 1, huy: 0, lan: 0 })
      expect(await readsFile(tx, "ha", path)).toBe(1)
    })
  })

  it("assigned to a class: its students and their parents, not other classes or withdrawn students", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id, path } = await material(tx, ids.hung)
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [id, classIds["TOAN6-2026A"]])
      const seen: Record<string, number> = {}
      for (const who of ["huy", "chau", "lan", "duc", "ha", "khang"] as const) seen[who] = await sees(tx, who, id)
      expect(seen).toEqual({ huy: 1, chau: 1, lan: 1, duc: 1, ha: 0, khang: 0 })
      expect(await readsFile(tx, "chau", path)).toBe(1)
      expect(await readsFile(tx, "khang", path)).toBe(0)
      await switchUser(tx, ids.hung)
      expect(await one(tx, "select shared_by_name from public.library_material_classes where material_id = $1", [id])).toBe("Lê Văn Hùng")
    })
  })

  it("shared with one student: that student and their parents only", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id, path } = await material(tx, ids.hung)
      await tx.query("insert into public.library_material_students (material_id, student_id) values ($1, $2)", [id, studentIds.HS001])
      const seen: Record<string, number> = {}
      for (const who of ["huy", "lan", "chau", "duc"] as const) seen[who] = await sees(tx, who, id)
      expect(seen).toEqual({ huy: 1, lan: 1, chau: 0, duc: 0 })
      expect({ huy: await readsFile(tx, "huy", path), chau: await readsFile(tx, "chau", path) }).toEqual({ huy: 1, chau: 0 })
    })
  })

  it("archiving hides it from everyone but its managers, file included", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id, path } = await material(tx, ids.hung, { visibility: "staff" })
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [id, classIds["TOAN6-2026A"]])
      await tx.query("update public.library_materials set archived_at = now() where id = $1", [id])
      expect({ huy: await sees(tx, "huy", id), ha: await sees(tx, "ha", id), hung: await sees(tx, "hung", id), admin: await sees(tx, "admin", id) }).toEqual({ huy: 0, ha: 0, hung: 1, admin: 1 })
      expect(await readsFile(tx, "huy", path)).toBe(0)
      await switchUser(tx, ids.hung)
      await rejects(tx, "insert into public.library_material_students (material_id, student_id) values ($1, $2)", [id, studentIds.HS003], /row-level security/)
    })
  })

  it("students only see assignment rows of their own classes", async () => {
    await as(db, ids.admin, async (tx) => {
      const { id } = await material(tx, ids.admin, { scope: "academy", visibility: "staff" })
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2), ($1, $3)", [id, classIds["TOAN6-2026A"], classIds["FLY-2026A"]])
      await switchUser(tx, ids.chau)
      expect(await rows(tx, "select 1 from public.library_material_classes where material_id = $1", [id])).toBe(1)
      await switchUser(tx, ids.hung)
      expect(await rows(tx, "select 1 from public.library_material_classes where material_id = $1", [id])).toBe(1)
    })
  })
})

describe("reuse and sharing", () => {
  it("a teacher reuses a colleague's staff material in their own class, but not a private one", async () => {
    await as(db, ids.ha, async (tx) => {
      const shared = await material(tx, ids.ha, { visibility: "staff" })
      const hidden = await material(tx, ids.ha)
      await switchUser(tx, ids.hung)
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [shared.id, classIds["TOAN6-2026A"]])
      await rejects(tx, "insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [hidden.id, classIds["TOAN6-2026A"]], /row-level security/)
      // Seeing a material through a class does not allow passing it on.
      await switchUser(tx, ids.ha)
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [hidden.id, classIds["FLY-2026A"]])
      await switchUser(tx, ids.tuan)
      expect(await rows(tx, "select 1 from public.library_materials where id = $1", [hidden.id])).toBe(1)
      await rejects(tx, "insert into public.library_material_students (material_id, student_id) values ($1, $2)", [hidden.id, studentIds.HS002], /row-level security/)
    })
  })

  it("teachers assign only to classes and students they teach; admins anywhere", async () => {
    await as(db, ids.ha, async (tx) => {
      const { id } = await material(tx, ids.ha, { visibility: "staff" })
      await rejects(tx, "insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [id, classIds["TOAN6-2026A"]], /row-level security/)
      await rejects(tx, "insert into public.library_material_students (material_id, student_id) values ($1, $2)", [id, studentIds.HS003], /row-level security/)
      await switchUser(tx, ids.admin)
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [id, classIds["TOAN6-2026A"]])
      expect(await sees(tx, "huy", id)).toBe(1)
    })
  })

  it("students and parents cannot share or assign", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id } = await material(tx, ids.hung, { visibility: "staff" })
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [id, classIds["TOAN6-2026A"]])
      for (const who of ["huy", "lan"] as const) {
        await switchUser(tx, ids[who])
        await rejects(tx, "insert into public.library_material_students (material_id, student_id) values ($1, $2)", [id, studentIds.HS003], /row-level security/)
        expect(await rows(tx, "delete from public.library_material_classes where material_id = $1 returning 1", [id])).toBe(0)
      }
    })
  })
})

describe("managing", () => {
  it("teachers manage only their own materials; admins manage all; files and owners are fixed", async () => {
    await as(db, ids.hung, async (tx) => {
      const { id, path } = await material(tx, ids.hung, { visibility: "staff" })
      await switchUser(tx, ids.ha)
      expect(await rows(tx, "update public.library_materials set title = 'mine' where id = $1 returning 1", [id])).toBe(0)
      expect(await rows(tx, "delete from public.library_materials where id = $1 returning 1", [id])).toBe(0)
      await tx.exec("savepoint d")
      expect(await rows(tx, "delete from storage.objects where name = $1 returning 1", [path])).toBe(0)
      await tx.exec("rollback to savepoint d")
      await switchUser(tx, ids.hung)
      await rejects(tx, "update public.library_materials set object_path = 'library/x/y.pdf' where id = $1", [id], /permission denied/)
      await rejects(tx, "update public.library_materials set owner_id = $2 where id = $1", [id, ids.ha], /permission denied/)
      await switchUser(tx, ids.admin)
      expect(await rows(tx, "update public.library_materials set archived_at = now() where id = $1 returning 1", [id])).toBe(1)
    })
    await as(db, ids.admin, async (tx) => {
      const { id } = await material(tx, ids.admin, { scope: "academy", visibility: "staff" })
      await switchUser(tx, ids.hung)
      expect(await rows(tx, "update public.library_materials set archived_at = now() where id = $1 returning 1", [id])).toBe(0)
    })
  })

  it("favourites are personal and only for readable materials", async () => {
    await as(db, ids.hung, async (tx) => {
      const assigned = await material(tx, ids.hung)
      const hidden = await material(tx, ids.hung)
      await tx.query("insert into public.library_material_classes (material_id, class_id) values ($1, $2)", [assigned.id, classIds["TOAN6-2026A"]])
      await switchUser(tx, ids.huy)
      await tx.query("insert into public.library_favorites (user_id, material_id) values ($1, $2)", [ids.huy, assigned.id])
      await rejects(tx, "insert into public.library_favorites (user_id, material_id) values ($1, $2)", [ids.huy, hidden.id], /row-level security/)
      await rejects(tx, "insert into public.library_favorites (user_id, material_id) values ($1, $2)", [ids.chau, assigned.id], /row-level security/)
      await switchUser(tx, ids.chau)
      expect(await rows(tx, "select 1 from public.library_favorites")).toBe(0)
    })
  })
})
