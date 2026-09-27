import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // TOAN6-2026A: Tue & Thu 18:00–19:30, P101
  ha: "gv.ha@bsmart.test", // FLY-2026A: Mon & Wed 17:30–19:00, P202 (+ KET-2025B, completed)
  tuan: "gv.tuan@bsmart.test", // assistant in FLY-2026A
  vinh: "gv.vinh@bsmart.test", // inactive teacher
  lan: "ph.lan@bsmart.test", // children HS001 (TOAN6) and HS002 (FLY)
  duc: "ph.duc@bsmart.test", // child HS003 (TOAN6)
  huy: "hs.huy@bsmart.test", // HS001
  khang: "hs.khang@bsmart.test", // HS004, withdrawn
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const teacherIds: Record<string, string> = {}
const courseIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; teacher_code: string }>("select id, teacher_code from public.teachers")).rows)
    teacherIds[r.teacher_code] = r.id
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.courses")).rows) courseIds[r.code] = r.id
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))

/** Creates a planned class on an active course, as admin, inside `tx`. */
async function newClass(tx: Session, code: string, extra: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    code,
    name: code,
    course_id: courseIds["ANH-KET"],
    status: "planned",
    start_date: "2026-10-05",
    end_date: "2027-03-26",
    ...extra,
  }
  const columns = Object.keys(fields)
  const values = Object.values(fields)
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ")
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.classes (${columns.join(", ")}) values (${placeholders}) returning id`,
    values
  )
  return rows[0].id
}

describe("timetable visibility (timetable_entries view)", () => {
  const entries = (who: Who) =>
    as(db, ids[who], (tx) =>
      column(tx, "select class_code || ':' || weekday || ':' || to_char(starts_at, 'HH24:MI') from public.timetable_entries")
    )

  const TOAN6 = ["TOAN6-2026A:2:18:00", "TOAN6-2026A:4:18:00"]
  const FLY = ["FLY-2026A:1:17:30", "FLY-2026A:3:17:30"]

  it.each([
    ["admin", [...FLY, ...TOAN6]], // KET-2025B is completed, so it is not on the timetable
    ["hung", TOAN6],
    ["ha", FLY],
    ["tuan", FLY],
    ["vinh", []],
    ["lan", [...FLY, ...TOAN6]],
    ["duc", TOAN6],
    ["huy", TOAN6],
    ["khang", []],
  ] as const)("%s sees %j", async (who, expected) => {
    expect(await entries(who)).toEqual([...expected].sort())
  })

  it("anonymous users cannot read it", async () => {
    await expect(as(db, null, (tx) => tx.query("select * from public.timetable_entries"))).rejects.toThrow(
      /permission denied/
    )
  })

  it("exposes teacher ids for filtering and the lead teacher's name", async () => {
    const { rows } = await run(
      "admin",
      "select lead_teacher_name, cardinality(teacher_ids) as n from public.timetable_entries where class_code = 'FLY-2026A' limit 1"
    )
    expect(rows[0]).toEqual({ lead_teacher_name: "Phạm Thu Hà", n: 2 })
  })

  it("schedule slots follow class visibility", async () => {
    const count = async (who: Who) =>
      (await run(who, "select 1 from public.class_schedule_slots")).rows.length
    expect(await count("admin")).toBe(5)
    expect(await count("hung")).toBe(2)
    expect(await count("huy")).toBe(3) // TOAN6 (2) + completed KET (1)
    expect(await count("khang")).toBe(0)
  })
})

describe("teachers: subjects and qualifications", () => {
  it("are visible wherever the teacher is visible", async () => {
    const quals = (who: Who) =>
      as(db, ids[who], (tx) => column(tx, "select title from public.teacher_qualifications"))
    expect(await quals("admin")).toHaveLength(5)
    expect(await quals("hung")).toEqual(["Cử nhân Sư phạm Toán"])
    // Huy's teachers: Hùng (TOAN6) and Hà (KET).
    expect(await quals("huy")).toEqual(["Cambridge CELTA", "Cử nhân Ngôn ngữ Anh", "Cử nhân Sư phạm Toán"])
    expect(await quals("khang")).toEqual([])
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot edit qualifications or subjects", async (who) => {
    await expect(
      run(who, "insert into public.teacher_qualifications (teacher_id, title) values ($1, 'x')", [teacherIds.GV001])
    ).rejects.toThrow(/row-level security/)
    await expect(
      run(who, "insert into public.teacher_subjects (teacher_id, subject_id) select $1, id from public.subjects where code = 'ANH'", [
        teacherIds.GV001,
      ])
    ).rejects.toThrow(/row-level security/)
  })

  it("admin can add qualifications and subjects; duplicates are rejected", async () => {
    await expect(
      run("admin", "insert into public.teacher_qualifications (teacher_id, title, year_awarded) values ($1, 'TESOL', 2024)", [
        teacherIds.GV001,
      ])
    ).resolves.toBeDefined()
    await expect(
      run("admin", "insert into public.teacher_subjects (teacher_id, subject_id) select $1, id from public.subjects where code = 'TOAN'", [
        teacherIds.GV001,
      ])
    ).rejects.toThrow(/duplicate key/)
    await expect(
      run("admin", "insert into public.teacher_qualifications (teacher_id, title, year_awarded) values ($1, 'x', 1800)", [
        teacherIds.GV001,
      ])
    ).rejects.toThrow(/check constraint/)
  })
})

describe("teacher assignment", () => {
  const assign = (who: Who, klass: string, teacher: string, role = "lead_teacher") =>
    run(who, "select public.assign_class_teacher($1, $2, $3)", [classIds[klass], teacherIds[teacher], role])

  it.each(["hung", "lan", "huy"] as const)("%s cannot assign teachers", async (who) => {
    await expect(assign(who, "FLY-2026A", "GV003", "assistant_teacher")).rejects.toThrow(/permission to manage classes/)
  })

  it("making a new lead demotes the previous lead in the same step", async () => {
    const roles = await as(db, ids.admin, async (tx) => {
      await tx.query("select public.assign_class_teacher($1, $2, 'lead_teacher')", [classIds["FLY-2026A"], teacherIds.GV003])
      return column(
        tx,
        "select t.teacher_code || ':' || cm.member_role from public.class_members cm join public.teachers t on t.id = cm.teacher_id where cm.class_id = $1",
        [classIds["FLY-2026A"]]
      )
    })
    expect(roles).toEqual(["GV002:assistant_teacher", "GV003:lead_teacher"])
  })

  it("rejects inactive teachers", async () => {
    await expect(assign("admin", "FLY-2026A", "GV004", "assistant_teacher")).rejects.toThrow(/Only active teachers/)
  })

  it("rejects double-booking a teacher", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        // FLY gets a Tuesday slot overlapping Hùng's TOAN6 class, in another room.
        await tx.query(
          "insert into public.class_schedule_slots (class_id, weekday, starts_at, ends_at, room) values ($1, 2, '18:30', '19:30', 'P303')",
          [classIds["FLY-2026A"]]
        )
        await tx.query("select public.assign_class_teacher($1, $2, 'assistant_teacher')", [classIds["FLY-2026A"], teacherIds.GV001])
      })
    ).rejects.toThrow(/Lê Văn Hùng already teaches Toán 6 nâng cao – 2026A on Tuesday 18:00–19:30/)
  })

  it("assigning a teacher is visible to them immediately", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("select public.assign_class_teacher($1, $2, 'assistant_teacher')", [classIds["TOAN6-2026A"], teacherIds.GV003])
      await switchUser(tx, ids.tuan)
      return column(tx, "select class_code from public.timetable_entries")
    })
    expect(seen).toEqual(["FLY-2026A", "FLY-2026A", "TOAN6-2026A", "TOAN6-2026A"])
  })

  it("teachers still teaching running classes cannot be archived or deactivated", async () => {
    await expect(run("admin", "update public.teachers set deleted_at = now() where teacher_code = 'GV001'")).rejects.toThrow(
      /still teaches/
    )
    await expect(run("admin", "update public.teachers set status = 'inactive' where teacher_code = 'GV001'")).rejects.toThrow(
      /still teaches/
    )
    // GV004 teaches nothing current.
    await expect(run("admin", "update public.teachers set deleted_at = now() where teacher_code = 'GV004'")).resolves.toBeDefined()
  })
})

describe("timetable conflicts", () => {
  const slot = (tx: Session, classId: string, weekday: number, start: string, end: string, room?: string) =>
    tx.query(
      "insert into public.class_schedule_slots (class_id, weekday, starts_at, ends_at, room) values ($1, $2, $3, $4, $5)",
      [classId, weekday, start, end, room ?? null]
    )

  it("rejects double-booking a room", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, "ROOM-TEST", { room: "P202" })
        await slot(tx, id, 1, "18:00", "19:30")
      })
    ).rejects.toThrow(/Room P202 is already booked for Flyers – 2026A on Monday 17:30–19:00/)
  })

  it("room comparison ignores case", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, "ROOM-CASE")
        await slot(tx, id, 3, "18:00", "18:45", "p202")
      })
    ).rejects.toThrow(/Room p202 is already booked/)
  })

  it("allows back-to-back slots, other rooms, completed classes and non-overlapping dates", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, "OK-1", { room: "P202" })
        await slot(tx, id, 1, "19:00", "20:00") // starts when FLY ends
        await slot(tx, id, 1, "16:00", "17:30") // ends when FLY starts
        await slot(tx, id, 2, "18:00", "19:30", "P404") // TOAN6's time, different room, no shared teacher
        await slot(tx, id, 6, "08:00", "09:30") // KET-2025B's slot, but that class is completed
        const later = await tx.query<{ id: string }>(
          "insert into public.classes (code, name, course_id, status, start_date, end_date, room) values ('LATER', 'Later', $1, 'planned', '2027-07-01', '2027-12-01', 'P202') returning id",
          [courseIds["ANH-KET"]]
        )
        await slot(tx, later.rows[0].id, 1, "17:30", "19:00") // FLY's slot, after FLY ends
      })
    ).resolves.toBeUndefined()
  })

  it("completed classes do not block their room, even when dates overlap", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        // Same room, weekday, time and dates as KET-2025B, which is completed.
        const id = await newClass(tx, "SAT-OK", { room: "P202", start_date: "2025-09-08", end_date: "2026-05-29" })
        await slot(tx, id, 6, "08:30", "09:00")
      })
    ).resolves.toBeUndefined()
  })

  it("online classes never clash on rooms", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, "ONLINE-1", { delivery_mode: "online", meeting_url: "https://meet.example.test/a", room: "P202" })
        await slot(tx, id, 1, "17:30", "19:00")
      })
    ).resolves.toBeUndefined()
  })

  it("re-checks when a class's dates change", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const later = await tx.query<{ id: string }>(
          "insert into public.classes (code, name, course_id, status, start_date, end_date, room) values ('MOVE', 'Move', $1, 'planned', '2027-07-01', '2027-12-01', 'P202') returning id",
          [courseIds["ANH-KET"]]
        )
        await slot(tx, later.rows[0].id, 1, "17:30", "19:00")
        await tx.query("update public.classes set start_date = '2027-01-04' where id = $1", [later.rows[0].id])
      })
    ).rejects.toThrow(/Room P202 is already booked/)
  })

  it("re-checks when a completed class is reopened", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, "SAT", { room: "P202", start_date: "2025-09-08", end_date: "2026-05-29" })
        await slot(tx, id, 6, "08:30", "09:00")
        await tx.query("update public.classes set status = 'active' where code = 'KET-2025B'")
      })
    ).rejects.toThrow(/already booked/)
  })

  it("validates slot shape", async () => {
    const bad = (weekday: number, start: string, end: string) =>
      as(db, ids.admin, async (tx) => {
        const id = await newClass(tx, `BAD-${weekday}-${start.replace(":", "")}`)
        await slot(tx, id, weekday, start, end)
      })
    await expect(bad(8, "10:00", "11:00")).rejects.toThrow(/check constraint/)
    await expect(bad(2, "11:00", "10:00")).rejects.toThrow(/check constraint/)
    await expect(bad(2, "11:00", "11:00")).rejects.toThrow(/check constraint/)
  })

  it("only class editors can change the timetable", async () => {
    for (const who of ["hung", "lan", "huy"] as const) {
      await expect(
        run(who, "insert into public.class_schedule_slots (class_id, weekday, starts_at, ends_at) values ($1, 5, '08:00', '09:00')", [
          classIds["TOAN6-2026A"],
        ])
      ).rejects.toThrow(/row-level security/)
      const { rows } = await run(who, "delete from public.class_schedule_slots returning id")
      expect(rows).toHaveLength(0)
    }
  })
})

describe("courses and subjects", () => {
  it("new classes need an active course", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.courses set status = 'draft' where code = 'ANH-KET'")
        await newClass(tx, "DRAFT-COURSE")
      })
    ).rejects.toThrow(/active courses/)
  })

  it("draft courses are hidden from everyone but course editors", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.courses set status = 'draft' where code = 'ANH-KET'")
      const admin = await column(tx, "select code from public.courses")
      await switchUser(tx, ids.hung)
      const teacher = await column(tx, "select code from public.courses")
      return { admin, teacher }
    })
    expect(seen).toEqual({ admin: ["ANH-FLYERS", "ANH-KET", "TOAN6-NC"], teacher: ["ANH-FLYERS", "TOAN6-NC"] })
  })

  it("a course with running classes cannot be archived or deactivated", async () => {
    await expect(run("admin", "update public.courses set deleted_at = now() where code = 'TOAN6-NC'")).rejects.toThrow(
      /still has planned or running classes/
    )
    await expect(run("admin", "update public.courses set status = 'inactive' where code = 'TOAN6-NC'")).rejects.toThrow(
      /still has planned or running classes/
    )
    // ANH-KET only has a completed class.
    await expect(run("admin", "update public.courses set status = 'inactive' where code = 'ANH-KET'")).resolves.toBeDefined()
  })

  it("subjects and levels used by live courses cannot be archived", async () => {
    await expect(run("admin", "update public.subjects set deleted_at = now() where code = 'TOAN'")).rejects.toThrow(
      /subject is still used by courses/
    )
    await expect(run("admin", "update public.levels set deleted_at = now() where code = 'L6'")).rejects.toThrow(
      /level is still used by courses/
    )
    await expect(run("admin", "update public.levels set deleted_at = now() where code = 'L7'")).resolves.toBeDefined()
  })

  it("course units are appended in order and reordered atomically", async () => {
    const order = await as(db, ids.admin, async (tx) => {
      await tx.query("insert into public.course_units (course_id, title) values ($1, 'Mock test')", [courseIds["ANH-FLYERS"]])
      const last = await tx.query<{ id: string }>(
        "select id from public.course_units where course_id = $1 and title = 'Mock test'",
        [courseIds["ANH-FLYERS"]]
      )
      await tx.query("select public.move_course_unit($1, 'up')", [last.rows[0].id])
      const { rows } = await tx.query<{ title: string }>(
        "select title from public.course_units where course_id = $1 order by position",
        [courseIds["ANH-FLYERS"]]
      )
      return rows.map((r) => r.title)
    })
    expect(order).toEqual(["Vocabulary & Phonics", "Reading & Writing", "Mock test", "Listening & Speaking"])
  })

  it("course structure is readable by all roles but editable only by course editors", async () => {
    const units = async (who: Who) => (await run(who, "select 1 from public.course_units")).rows.length
    expect(await units("huy")).toBe(7)
    await expect(
      run("hung", "insert into public.course_units (course_id, title) values ($1, 'x')", [courseIds["TOAN6-NC"]])
    ).rejects.toThrow(/row-level security/)
    await expect(
      run("hung", "select public.move_course_unit(id, 'down') from public.course_units limit 1")
    ).rejects.toThrow(/permission to manage courses/)
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot create subjects, levels or courses", async (who) => {
    await expect(run(who, "insert into public.subjects (code, name) values ('LY', 'Vật lý')")).rejects.toThrow(
      /row-level security/
    )
    await expect(
      run(who, "insert into public.courses (code, name, subject_id) select 'X-1', 'x', id from public.subjects where code = 'TOAN'")
    ).rejects.toThrow(/row-level security/)
  })
})

describe("enrolment integrity", () => {
  it("rejects enrolment into completed or cancelled classes", async () => {
    const student = (await db.query<{ id: string }>("select id from public.students where student_code = 'HS003'")).rows[0].id
    await expect(
      run("admin", "select public.enroll_student($1, $2)", [student, classIds["KET-2025B"]])
    ).rejects.toThrow(/only be enrolled in planned or running classes/)
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.classes set status = 'cancelled' where code = 'FLY-2026A'")
        await tx.query("select public.enroll_student($1, $2)", [student, classIds["FLY-2026A"]])
      })
    ).rejects.toThrow(/only be enrolled in planned or running classes/)
  })

  it("removing a student (withdraw) takes them off the teacher's roster", async () => {
    const roster = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select e.id from public.enrollments e join public.students s on s.id = e.student_id where s.student_code = 'HS003' and e.class_id = $1",
        [classIds["TOAN6-2026A"]]
      )
      await tx.query("select public.set_enrollment_status($1, 'withdrawn')", [rows[0].id])
      await switchUser(tx, ids.hung)
      return column(tx, "select student_code from public.students")
    })
    expect(roster).toEqual(["HS001"])
  })
})

describe("internal notes are staff-only", () => {
  const notesOf = async (who: Who, table: "students" | "teachers") =>
    run(who, `select notes from public.${table} limit 1`)

  it.each(["huy", "lan", "hung"] as const)("%s cannot read notes columns directly", async (who) => {
    await expect(notesOf(who, "students")).rejects.toThrow(/permission denied/)
    await expect(notesOf(who, "teachers")).rejects.toThrow(/permission denied/)
  })

  it("parents' notes are withheld too", async () => {
    await expect(run("lan", "select notes from public.parents")).rejects.toThrow(/permission denied/)
  })

  it("student_notes() serves admins and the student's teachers only", async () => {
    const withNote = async (reader: Who) =>
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.students set notes = 'Needs extra reading practice.' where student_code = 'HS001'")
        await switchUser(tx, ids[reader])
        const { rows } = await tx.query<{ notes: string | null }>(
          "select public.student_notes(id) as notes from public.students where student_code = 'HS001'"
        )
        return rows[0]?.notes ?? null
      })
    expect(await withNote("admin")).toBe("Needs extra reading practice.")
    expect(await withNote("hung")).toBe("Needs extra reading practice.")
    expect(await withNote("lan")).toBeNull()
    expect(await withNote("huy")).toBeNull()
  })

  it("teacher_notes() serves teacher editors only", async () => {
    const read = (who: Who) =>
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.teachers set notes = 'Contract renewal in June.' where teacher_code = 'GV001'")
        await switchUser(tx, ids[who])
        return (await tx.query<{ n: string | null }>("select public.teacher_notes($1) as n", [teacherIds.GV001])).rows[0].n
      })
    expect(await read("admin")).toBe("Contract renewal in June.")
    expect(await read("hung")).toBeNull()
  })

  it("admins can still write notes", async () => {
    const { rows } = await run("admin", "update public.students set notes = 'x' where student_code = 'HS002' returning id")
    expect(rows).toHaveLength(1)
  })
})

describe("class delivery", () => {
  it("online and hybrid classes require a meeting link", async () => {
    await expect(
      as(db, ids.admin, (tx) => newClass(tx, "ONLINE-NO-LINK", { delivery_mode: "online" }))
    ).rejects.toThrow(/classes_meeting_url_required/)
    await expect(
      as(db, ids.admin, (tx) => newClass(tx, "BAD-LINK", { delivery_mode: "online", meeting_url: "http://insecure.test" }))
    ).rejects.toThrow(/check constraint/)
  })
})
