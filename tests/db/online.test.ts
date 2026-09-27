import { beforeAll, describe, expect, it } from "vitest"

import { isValidMeetingUrl, MEETING_PROVIDERS } from "@/lib/meetings"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán (GV001)
  ha: "gv.ha@bsmart.test", // Flyers lead (GV002)
  tuan: "gv.tuan@bsmart.test", // Flyers assistant
  vinh: "gv.vinh@bsmart.test",
  lan: "ph.lan@bsmart.test", // HS001 (Toán) + HS002 (Flyers)
  duc: "ph.duc@bsmart.test", // HS003 (Toán)
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // withdrew from Flyers
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const teacherIds: Record<string, string> = {}
const studentIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; teacher_code: string }>("select id, teacher_code from public.teachers")).rows) teacherIds[r.teacher_code] = r.id
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows) studentIds[r.student_code] = r.id
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const count = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], async (tx) => (await tx.query(sql, params)).rows.length)

async function asOwner(tx: Session, sql: string, params: unknown[] = []) {
  await tx.exec("reset role")
  try {
    return await tx.query(sql, params)
  } finally {
    await tx.exec("set local role authenticated")
  }
}

/** A Toán session by Hùng starting `minutes` from now. */
async function toanSession(tx: Session, minutes = 10, fields: Record<string, unknown> = {}) {
  const values = {
    teacher_id: teacherIds.GV001,
    title: "Luyện tập",
    starts_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    ends_at: new Date(Date.now() + (minutes + 60) * 60_000).toISOString(),
    provider: "zoom",
    meeting_url: "https://zoom.us/j/123456789",
    ...fields,
  }
  const keys = Object.keys(values)
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.online_sessions (class_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [classIds["TOAN6-2026A"], ...Object.values(values)]
  )
  return rows[0].id
}

const join = async (tx: Session, sessionId: string) => (await tx.query<{ url: string }>("select public.join_online_session($1) as url", [sessionId])).rows[0].url

// ---------------------------------------------------------------------------

describe("who sees what", () => {
  it.each([
    ["admin", 3],
    ["ha", 2],
    ["tuan", 2],
    ["hung", 1],
    ["huy", 1],
    ["chau", 1],
    ["lan", 3], // Huy's Toán + Ngọc Anh's Flyers
    ["duc", 1],
    ["khang", 0],
    ["vinh", 0],
  ] as const)("%s sees %i sessions", async (who, n) => {
    expect(await count(who, "select 1 from public.online_sessions")).toBe(n)
  })

  it("hidden materials and teaching notes are for the class's staff only", async () => {
    expect(await count("ha", "select 1 from public.online_session_materials")).toBe(3)
    expect(await count("tuan", "select 1 from public.online_session_materials")).toBe(3)
    expect(await count("lan", "select 1 from public.online_session_materials")).toBe(2)
    expect(await count("huy", "select 1 from public.online_session_materials")).toBe(0)
    expect(await count("ha", "select 1 from public.online_session_notes")).toBe(1)
    for (const who of ["lan", "huy", "hung", "khang"] as const) expect(await count(who, "select 1 from public.online_session_notes")).toBe(0)
    expect(await count("lan", "select 1 from public.online_session_homework")).toBe(1)
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["online_sessions", "online_session_materials", "online_session_notes", "online_session_joins"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })
})

describe("scheduling", () => {
  it("a teacher schedules for their own class; the academy date is derived", async () => {
    const row = await as(db, ids.hung, async (tx) => {
      const id = await toanSession(tx, 0, {
        starts_at: "2026-10-20T16:30:00Z", // 23:30 in Vietnam
        ends_at: "2026-10-20T17:30:00Z", // 00:30 next day
      })
      return (await tx.query<{ session_date: string; status: string; created_by: string }>(
        "select to_char(session_date, 'YYYY-MM-DD') as session_date, status, created_by from public.online_sessions where id = $1",
        [id]
      )).rows[0]
    })
    expect(row).toEqual({ session_date: "2026-10-20", status: "scheduled", created_by: ids.hung })
  })

  it("only the class's teachers, and only a teacher of the class as host", async () => {
    await expect(
      run("hung", "insert into public.online_sessions (class_id, teacher_id, title, starts_at, ends_at, provider) values ($1, $2, 'x', now() + interval '1 day', now() + interval '25 hours', 'other')", [
        classIds["FLY-2026A"],
        teacherIds.GV001,
      ])
    ).rejects.toThrow(/row-level security|must teach this class/)
    await expect(as(db, ids.hung, (tx) => toanSession(tx, 60, { teacher_id: teacherIds.GV002 }))).rejects.toThrow(/must teach this class/)
    await expect(as(db, ids.huy, (tx) => toanSession(tx))).rejects.toThrow(/row-level security/)
    // Admins schedule for any class, with one of its teachers.
    expect(await as(db, ids.admin, (tx) => toanSession(tx, 120))).toBeTruthy()
  })

  it.each([
    ["ends before it starts", { ends_at: new Date(Date.now() - 60_000).toISOString() }, /check constraint/],
    ["longer than 8 hours", { ends_at: new Date(Date.now() + 10 * 3_600_000).toISOString() }, /check constraint/],
    ["outside the class dates", { starts_at: "2030-01-01T10:00:00Z", ends_at: "2030-01-01T11:00:00Z" }, /class dates/],
    ["a Meet link that is not Meet", { provider: "google_meet", meeting_url: "https://zoom.us/j/1" }, /check constraint/],
    ["a plain http link", { provider: "other", meeting_url: "http://example.test/meet" }, /check constraint/],
  ] as const)("refuses %s", async (_label, fields, error) => {
    await expect(as(db, ids.hung, (tx) => toanSession(tx, 60, fields))).rejects.toThrow(error)
  })

  it("finished classes take no sessions; a teacher cannot be double-booked", async () => {
    await expect(
      run("admin", "insert into public.online_sessions (class_id, teacher_id, title, starts_at, ends_at, provider) values ($1, $2, 'x', now() + interval '1 day', now() + interval '25 hours', 'other')", [
        classIds["KET-2025B"],
        teacherIds.GV002,
      ])
    ).rejects.toThrow(/planned or running classes/)
    await expect(
      as(db, ids.hung, async (tx) => {
        await toanSession(tx, 60)
        await toanSession(tx, 90) // overlaps the first
      })
    ).rejects.toThrow(/already has an online session/)
    const ok = await as(db, ids.hung, async (tx) => {
      const first = await toanSession(tx, 60)
      await tx.query("update public.online_sessions set status = 'cancelled', cancelled_reason = 'Ốm' where id = $1", [first])
      return toanSession(tx, 90)
    })
    expect(ok).toBeTruthy()
  })

  it("lifecycle: scheduled -> live -> ended; cancelling needs a reason", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const id = await toanSession(tx)
      await tx.query("update public.online_sessions set status = 'live' where id = $1", [id])
      const live = (await tx.query<{ started: boolean }>("select started_at is not null as started from public.online_sessions where id = $1", [id])).rows[0]
      await tx.query("update public.online_sessions set status = 'ended' where id = $1", [id])
      const ended = (await tx.query<{ ended: boolean }>("select ended_at is not null as ended from public.online_sessions where id = $1", [id])).rows[0]
      return { live: live.started, ended: ended.ended }
    })
    expect(result).toEqual({ live: true, ended: true })
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await toanSession(tx)
        await tx.query("update public.online_sessions set status = 'ended' where id = $1", [id])
      })
    ).rejects.toThrow(/cannot go from scheduled to ended/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await toanSession(tx)
        await tx.query("update public.online_sessions set status = 'cancelled' where id = $1", [id])
      })
    ).rejects.toThrow(/check constraint/)
    await expect(run("admin", "delete from public.online_sessions")).rejects.toThrow(/permission denied/)
  })
})

describe("joining", () => {
  it("a student of the class joins from 15 minutes before; every join is logged", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const id = await toanSession(tx, 10)
      await switchUser(tx, ids.huy)
      const url = await join(tx, id)
      await join(tx, id)
      await switchUser(tx, ids.chau)
      await join(tx, id)
      const chauSees = (await tx.query("select 1 from public.online_session_joins where session_id = $1", [id])).rows.length
      await switchUser(tx, ids.hung)
      const rows = (await tx.query<{ student_id: string; join_count: number }>(
        "select student_id, join_count from public.online_session_joins where session_id = $1 order by join_count desc",
        [id]
      )).rows
      return { url, chauSees, rows }
    })
    expect(result.url).toBe("https://zoom.us/j/123456789")
    expect(result.chauSees).toBe(1) // only her own
    expect(result.rows).toEqual([
      { student_id: studentIds.HS001, join_count: 2 },
      { student_id: studentIds.HS003, join_count: 1 },
    ])
  })

  it.each([
    ["too early", async (tx: Session) => toanSession(tx, 120), /opens 15 minutes before/],
    ["cancelled", async (tx: Session) => {
      const id = await toanSession(tx, 5)
      await tx.query("update public.online_sessions set status = 'cancelled', cancelled_reason = 'x' where id = $1", [id])
      return id
    }, /cancelled/],
    ["no link yet", async (tx: Session) => toanSession(tx, 5, { meeting_url: null }), /has not been added/],
    ["finished", async (tx: Session) => {
      const id = await toanSession(tx, 5)
      await asOwner(tx, "alter table public.online_sessions disable trigger online_sessions_prepare")
      await asOwner(tx, "update public.online_sessions set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' where id = $1", [id])
      await asOwner(tx, "alter table public.online_sessions enable trigger online_sessions_prepare")
      return id
    }, /has finished/],
  ] as const)("refuses to join when %s", async (_label, setup, error) => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await setup(tx)
        await switchUser(tx, ids.huy)
        await join(tx, id)
      })
    ).rejects.toThrow(error)
  })

  it("parents, teachers and other classes' students cannot join; joins cannot be forged", async () => {
    for (const who of ["lan", "hung"] as const) {
      await expect(
        as(db, ids.hung, async (tx) => {
          const id = await toanSession(tx, 5)
          await switchUser(tx, ids[who])
          await join(tx, id)
        })
      ).rejects.toThrow(/Only students join/)
    }
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await toanSession(tx, 5)
        await switchUser(tx, ids.khang)
        await join(tx, id)
      })
    ).rejects.toThrow(/not found/)
    await expect(
      run("huy", "insert into public.online_session_joins (session_id, student_id) select id, $1 from public.online_sessions", [studentIds.HS001])
    ).rejects.toThrow(/permission denied/)
  })
})

describe("attendance, homework and materials", () => {
  const today = () => db.query<{ d: string }>("select to_char(private.academy_today(), 'YYYY-MM-DD') as d").then((r) => r.rows[0].d)

  it("on an online day, an in-person class records online attendance (and defaults to it)", async () => {
    const date = await today()
    const via = await as(db, ids.hung, async (tx) => {
      await toanSession(tx, 0, {
        starts_at: new Date(`${date}T11:00:00Z`).toISOString(),
        ends_at: new Date(`${date}T12:00:00Z`).toISOString(),
      })
      const { rows } = await tx.query<{ id: string }>("select public.save_attendance($1, $2, $3) as id", [
        classIds["TOAN6-2026A"],
        date,
        JSON.stringify([{ student_id: studentIds.HS001, status: "present" }, { student_id: studentIds.HS003, status: "present", attended_via: "in_person" }]),
      ])
      return column(tx, "select attended_via from public.attendance_records where session_id = $1 order by attended_via", [rows[0].id])
    })
    expect(via).toEqual(["in_person", "online"])
  })

  it("homework must be an assignment of the same class", async () => {
    // Read outside the transaction (Hùng cannot see Flyers work).
    const other = (await db.query<{ id: string }>(
      "select a.id from public.assignments a join public.classes c on c.id = a.class_id where c.code = 'FLY-2026A' limit 1"
    )).rows[0].id
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await toanSession(tx)
        await tx.query("insert into public.online_session_homework (session_id, assignment_id) values ($1, $2)", [id, other])
      })
    ).rejects.toThrow(/same class/)
    const linked = await as(db, ids.hung, async (tx) => {
      const id = await toanSession(tx)
      const hw = (await tx.query<{ id: string }>("select id from public.assignments a where a.class_id = $1 limit 1", [classIds["TOAN6-2026A"]])).rows[0].id
      await tx.query("insert into public.online_session_homework (session_id, assignment_id) values ($1, $2)", [id, hw])
      await switchUser(tx, ids.huy)
      return (await tx.query("select 1 from public.online_session_homework where session_id = $1", [id])).rows.length
    })
    expect(linked).toBe(1)
  })

  it("material files: teachers upload; students open visible ones only", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      const id = await toanSession(tx)
      const add = async (visible: boolean) => {
        const path = `online-sessions/${id}/${crypto.randomUUID()}.pdf`
        await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size: 1000, mimetype: "application/pdf" })])
        await tx.query(
          "insert into public.online_session_materials (session_id, kind, title, object_path, file_name, mime_type, size_bytes, visible_to_students) values ($1, 'file', 'Phiếu', $2, 'phieu.pdf', 'application/pdf', 1000, $3)",
          [id, path, visible]
        )
        return path
      }
      const shown = await add(true)
      const hidden = await add(false)
      await switchUser(tx, ids.huy)
      const huy = {
        shown: (await tx.query("select 1 from storage.objects where name = $1", [shown])).rows.length,
        hidden: (await tx.query("select 1 from storage.objects where name = $1", [hidden])).rows.length,
      }
      await tx.exec("savepoint upload")
      await expect(
        tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [`online-sessions/${id}/${crypto.randomUUID()}.pdf`])
      ).rejects.toThrow(/row-level security/)
      await tx.exec("rollback to savepoint upload")
      return huy
    })
    expect(seen).toEqual({ shown: 1, hidden: 0 })
  })
})

describe("meeting links", () => {
  const cases: [string, string][] = [
    ["google_meet", "https://meet.google.com/abc-defg-hij"],
    ["google_meet", "https://meet.google.com/abc-defg-hij?authuser=1"],
    ["google_meet", "https://meet.google.com/ABC-defg-hij"],
    ["google_meet", "https://meet.google.com/lookup/xyz"],
    ["zoom", "https://us02web.zoom.us/j/81234567890?pwd=abc"],
    ["zoom", "https://zoom.us/my/teacher.ha"],
    ["zoom", "https://zoom.com/j/123"],
    ["zoom", "https://evilzoom.us/j/123"],
    ["zoom", "https://zoom.us.evil.test/j/123"],
    ["microsoft_teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc"],
    ["microsoft_teams", "https://teams.live.com/meet/9876"],
    ["microsoft_teams", "https://teams.example.test/meet"],
    ["other", "https://jitsi.example.test/bsmart"],
    ["other", "http://insecure.test"],
    ["other", "https://has space.test"],
  ]

  it("the app and the database agree on every provider pattern", async () => {
    const database = (await db.query<{ ok: boolean }>(
      `select private.meeting_url_valid(p::public.meeting_provider, u) as ok from unnest($1::text[], $2::text[]) as t(p, u)`,
      [cases.map((c) => c[0]), cases.map((c) => c[1])]
    )).rows.map((r) => r.ok)
    const app = cases.map(([p, u]) => isValidMeetingUrl(p as (typeof MEETING_PROVIDERS)[number], u))
    expect(app).toEqual(database)
    expect(app).toEqual([true, true, false, false, true, true, true, false, false, true, true, false, true, false, false])
  })
})
