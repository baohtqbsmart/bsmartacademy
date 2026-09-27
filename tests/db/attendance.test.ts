import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // TOAN6-2026A
  ha: "gv.ha@bsmart.test", // FLY-2026A (lead), KET-2025B
  tuan: "gv.tuan@bsmart.test", // FLY-2026A (assistant)
  vinh: "gv.vinh@bsmart.test", // deactivated
  lan: "ph.lan@bsmart.test", // HS001 + HS002
  duc: "ph.duc@bsmart.test", // HS003
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // HS004, withdrew from FLY on 2026-09-20
} as const
type Who = keyof typeof EMAILS

let db: TestDb
let today: string
const ids = {} as Record<Who, string>
const studentIds: Record<string, string> = {}
const classIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows)
    studentIds[r.student_code] = r.id
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  today = (await db.query<{ d: string }>("select to_char(private.academy_today(), 'YYYY-MM-DD') as d")).rows[0].d
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const codeOf = (studentId: string) => Object.entries(studentIds).find(([, id]) => id === studentId)![0]
const classCodeOf = (classId: string) => Object.entries(classIds).find(([, id]) => id === classId)![0]

type Entry = { student: string; status: string; attended_via?: string; minutes_late?: number; note?: string }
const entries = (list: Entry[]) =>
  JSON.stringify(list.map(({ student, ...rest }) => ({ student_id: studentIds[student], ...rest })))
const save = (tx: Session, klass: string, date: string, list: Entry[], notes: string | null = null) =>
  tx.query<{ id: string }>("select public.save_attendance($1, $2, $3::jsonb, $4) as id", [
    classIds[klass],
    date,
    entries(list),
    notes,
  ])

/** "HS001:TOAN6-2026A" pairs whose records `who` can read (the table alone). */
const visibleRecords = (who: Who) =>
  as(db, ids[who], async (tx) => {
    const { rows } = await tx.query<{ student_id: string; class_id: string }>(
      "select distinct student_id, class_id from public.attendance_records"
    )
    return rows.map((r) => `${codeOf(r.student_id)}:${classCodeOf(r.class_id)}`).sort()
  })

describe("who can see attendance", () => {
  it.each([
    [
      "admin",
      ["HS001:KET-2025B", "HS001:TOAN6-2026A", "HS002:FLY-2026A", "HS003:TOAN6-2026A", "HS004:FLY-2026A", "HS005:FLY-2026A"],
    ],
    ["hung", ["HS001:TOAN6-2026A", "HS003:TOAN6-2026A"]],
    // Ha teaches Flyers and taught Huy in KET; not Huy's Toán class. The
    // withdrawn student (HS004) is no longer one of her students.
    ["ha", ["HS001:KET-2025B", "HS002:FLY-2026A", "HS005:FLY-2026A"]],
    ["tuan", ["HS002:FLY-2026A", "HS005:FLY-2026A"]],
    ["vinh", []],
    ["huy", ["HS001:KET-2025B", "HS001:TOAN6-2026A"]],
    ["chau", ["HS003:TOAN6-2026A"]],
    // Students keep their own history after leaving a class.
    ["khang", ["HS004:FLY-2026A"]],
    ["lan", ["HS001:KET-2025B", "HS001:TOAN6-2026A", "HS002:FLY-2026A"]],
    ["duc", ["HS003:TOAN6-2026A"]],
  ] as const)("%s", async (who, expected) => {
    expect(await visibleRecords(who)).toEqual([...expected])
  })

  it("registers (dates, notes) are visible for the classes one teaches or attends", async () => {
    const classesOf = (who: Who) =>
      as(db, ids[who], async (tx) =>
        [...new Set((await column(tx, "select class_id from public.attendance_sessions")).map((id) => classCodeOf(String(id))))].sort()
      )
    expect(await classesOf("admin")).toEqual(["FLY-2026A", "KET-2025B", "TOAN6-2026A"])
    expect(await classesOf("hung")).toEqual(["TOAN6-2026A"])
    expect(await classesOf("huy")).toEqual(["KET-2025B", "TOAN6-2026A"])
    expect(await classesOf("duc")).toEqual(["TOAN6-2026A"])
    expect(await classesOf("vinh")).toEqual([])
  })

  it("archiving a student hides their attendance from teachers and parents", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.students set deleted_at = now() where student_code = 'HS001'")
      const pairs = async () =>
        (await tx.query<{ student_id: string }>("select distinct student_id from public.attendance_records")).rows.map((r) =>
          codeOf(r.student_id)
        )
      await switchUser(tx, ids.lan)
      const lan = await pairs()
      await switchUser(tx, ids.hung)
      const hung = await pairs()
      return { lan, hung }
    })
    expect(seen).toEqual({ lan: ["HS002"], hung: ["HS003"] })
  })

  it("a teacher removed from a class loses its attendance", async () => {
    const count = await as(db, ids.admin, async (tx) => {
      await tx.query("delete from public.class_members where class_id = $1", [classIds["TOAN6-2026A"]])
      await switchUser(tx, ids.hung)
      return (await tx.query("select 1 from public.attendance_records")).rows.length
    })
    expect(count).toBe(0)
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["attendance_records", "attendance_sessions"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
    await expect(
      as(db, null, (tx) => tx.query("select * from public.attendance_alerts()"))
    ).rejects.toThrow(/permission denied/)
  })
})

describe("taking attendance", () => {
  it("the class teacher marks, saves and adds notes", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const { rows } = await save(
        tx,
        "TOAN6-2026A",
        today,
        [
          { student: "HS001", status: "late", minutes_late: 15, note: "Kẹt xe" },
          { student: "HS003", status: "present" },
        ],
        "Ôn tập chương 2"
      )
      const session = (await tx.query<Record<string, string>>(
        "select notes, recorded_by, recorded_by_name from public.attendance_sessions where id = $1",
        [rows[0].id]
      )).rows[0]
      const records = (await tx.query<Record<string, unknown>>(
        "select student_id, status, attended_via, minutes_late, note, recorded_by from public.attendance_records where session_id = $1 order by status",
        [rows[0].id]
      )).rows
      return { session, records }
    })
    expect(result.session).toEqual({ notes: "Ôn tập chương 2", recorded_by: ids.hung, recorded_by_name: "Lê Văn Hùng" })
    expect(result.records).toEqual([
      { student_id: studentIds.HS003, status: "present", attended_via: "in_person", minutes_late: null, note: null, recorded_by: ids.hung },
      { student_id: studentIds.HS001, status: "late", attended_via: "in_person", minutes_late: 15, note: "Kẹt xe", recorded_by: ids.hung },
    ])
  })

  it("saving the same class and date again corrects the register instead of duplicating it", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const first = (await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }, { student: "HS003", status: "absent" }])).rows[0].id
      const second = (await save(tx, "TOAN6-2026A", today, [{ student: "HS003", status: "excused", note: "Có giấy phép" }])).rows[0].id
      const rows = (await tx.query<{ status: string; note: string | null }>(
        "select status, note from public.attendance_records where session_id = $1 order by status",
        [first]
      )).rows
      const sessions = (await tx.query("select 1 from public.attendance_sessions where class_id = $1 and session_date = $2", [
        classIds["TOAN6-2026A"],
        today,
      ])).rows.length
      return { same: first === second, rows, sessions }
    })
    expect(result).toEqual({
      same: true,
      sessions: 1,
      rows: [
        { status: "present", note: null },
        { status: "excused", note: "Có giấy phép" },
      ],
    })
  })

  it("the database rejects a second record for the same student, class and date", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        const session = (await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }])).rows[0].id
        await tx.query(
          "insert into public.attendance_records (session_id, class_id, session_date, student_id, status, attended_via) values ($1, $2, $3, $4, 'absent', null)",
          [session, classIds["TOAN6-2026A"], today, studentIds.HS001]
        )
      })
    ).rejects.toThrow(/attendance_records_one_per_student_class_date/)

    await expect(
      run("admin", "insert into public.attendance_sessions (class_id, session_date) select class_id, session_date from public.attendance_sessions limit 1")
    ).rejects.toThrow(/attendance_sessions_one_per_class_date/)
  })

  it("the same student twice in one save is rejected", async () => {
    await expect(
      as(db, ids.hung, (tx) =>
        save(tx, "TOAN6-2026A", today, [
          { student: "HS001", status: "present" },
          { student: "HS001", status: "absent" },
        ])
      )
    ).rejects.toThrow(/only be marked once/)
  })

  it("class and date always come from the register (forged values are overwritten)", async () => {
    const row = await as(db, ids.admin, async (tx) => {
      const session = (await save(tx, "TOAN6-2026A", today, [{ student: "HS003", status: "present" }])).rows[0].id
      return (await tx.query<{ class_id: string; recorded_by: string }>(
        `insert into public.attendance_records (session_id, class_id, session_date, student_id, status, recorded_by)
         values ($1, $2, '2020-01-01', $3, 'present', $4)
         returning class_id, recorded_by`,
        [session, classIds["FLY-2026A"], studentIds.HS001, ids.hung]
      )).rows[0]
    })
    expect(row).toEqual({ class_id: classIds["TOAN6-2026A"], recorded_by: ids.admin })
  })

  it("teachers cannot take attendance for classes they do not teach", async () => {
    await expect(as(db, ids.hung, (tx) => save(tx, "FLY-2026A", today, [{ student: "HS002", status: "present" }]))).rejects.toThrow(
      /classes you teach/
    )
    // Nor by writing the tables directly.
    await expect(
      run("hung", "insert into public.attendance_sessions (class_id, session_date) values ($1, $2)", [classIds["FLY-2026A"], today])
    ).rejects.toThrow(/row-level security/)
  })

  it("assistant teachers can take attendance for their class", async () => {
    const count = await as(db, ids.tuan, async (tx) => {
      const id = (await save(tx, "FLY-2026A", today, [{ student: "HS002", status: "present" }])).rows[0].id
      return (await tx.query("select 1 from public.attendance_records where session_id = $1", [id])).rows.length
    })
    expect(count).toBe(1)
  })

  it.each(["huy", "lan", "vinh"] as const)("%s cannot take attendance", async (who) => {
    await expect(as(db, ids[who], (tx) => save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }]))).rejects.toThrow(
      /classes you teach/
    )
  })

  it("a teacher removed from the class can no longer take its attendance", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("delete from public.class_members where class_id = $1", [classIds["TOAN6-2026A"]])
        await switchUser(tx, ids.hung)
        await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }])
      })
    ).rejects.toThrow(/classes you teach/)
  })
})

describe("attendance rules", () => {
  it("rejects future dates and dates outside the class", async () => {
    await expect(as(db, ids.admin, (tx) => save(tx, "TOAN6-2026A", "2099-01-06", [{ student: "HS001", status: "present" }]))).rejects.toThrow(
      /future date/
    )
    await expect(as(db, ids.admin, (tx) => save(tx, "TOAN6-2026A", "2026-09-01", [{ student: "HS001", status: "present" }]))).rejects.toThrow(
      /outside the class dates/
    )
  })

  it("rejects classes that are not running", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.classes set status = 'cancelled' where code = 'TOAN6-2026A'")
        await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }])
      })
    ).rejects.toThrow(/active or completed classes/)
  })

  it("only students enrolled in the class on that date can be marked", async () => {
    // Never in this class.
    await expect(as(db, ids.admin, (tx) => save(tx, "TOAN6-2026A", today, [{ student: "HS004", status: "present" }]))).rejects.toThrow(
      /not enrolled in the class/
    )
    // Withdrew on 2026-09-20.
    await expect(as(db, ids.admin, (tx) => save(tx, "FLY-2026A", today, [{ student: "HS004", status: "present" }]))).rejects.toThrow(
      /not enrolled in the class/
    )
    // Archived student.
    await expect(as(db, ids.admin, (tx) => save(tx, "TOAN6-2026A", today, [{ student: "HS006", status: "present" }]))).rejects.toThrow(
      /not enrolled in the class/
    )
  })

  it("in-person classes only take in-person attendance; hybrid classes take either", async () => {
    await expect(
      as(db, ids.hung, (tx) => save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present", attended_via: "online" }]))
    ).rejects.toThrow(/held in person/)

    const via = await as(db, ids.ha, async (tx) => {
      const id = (
        await save(tx, "FLY-2026A", today, [
          { student: "HS002", status: "present", attended_via: "online" },
          { student: "HS005", status: "present" },
        ])
      ).rows[0].id
      return (await tx.query<{ student_id: string; attended_via: string }>(
        "select student_id, attended_via from public.attendance_records where session_id = $1",
        [id]
      )).rows.map((r) => `${codeOf(r.student_id)}:${r.attended_via}`).sort()
    })
    expect(via).toEqual(["HS002:online", "HS005:in_person"])
  })

  it("online classes default to online and reject in person", async () => {
    const via = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.classes set delivery_mode = 'online', meeting_url = 'https://meet.example.test/x' where code = 'TOAN6-2026A'")
      const id = (await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "late", minutes_late: 5 }])).rows[0].id
      const value = (await tx.query<{ attended_via: string }>("select attended_via from public.attendance_records where session_id = $1", [id]))
        .rows[0].attended_via
      await expect(save(tx, "TOAN6-2026A", today, [{ student: "HS003", status: "present", attended_via: "in_person" }])).rejects.toThrow(
        /held online/
      )
      return value
    })
    expect(via).toBe("online")
  })

  it("absent/excused students have no attendance mode and only late students have minutes late", async () => {
    const rows = await as(db, ids.ha, async (tx) => {
      const id = (
        await save(tx, "FLY-2026A", today, [
          { student: "HS002", status: "absent", attended_via: "online", minutes_late: 10 },
          { student: "HS005", status: "present", minutes_late: 10 },
        ])
      ).rows[0].id
      return (await tx.query<Record<string, unknown>>(
        "select status, attended_via, minutes_late from public.attendance_records where session_id = $1 order by status",
        [id]
      )).rows
    })
    expect(rows).toEqual([
      { status: "present", attended_via: "in_person", minutes_late: null },
      { status: "absent", attended_via: null, minutes_late: null },
    ])
  })

  it("corrections cannot move a record to another student or class", async () => {
    const row = await as(db, ids.hung, async (tx) => {
      const id = (await save(tx, "TOAN6-2026A", today, [{ student: "HS001", status: "present" }])).rows[0].id
      return (await tx.query<{ student_id: string; class_id: string; status: string }>(
        "update public.attendance_records set student_id = $2, class_id = $3, status = 'absent' where session_id = $1 returning student_id, class_id, status",
        [id, studentIds.HS003, classIds["FLY-2026A"]]
      )).rows[0]
    })
    expect(row).toEqual({ student_id: studentIds.HS001, class_id: classIds["TOAN6-2026A"], status: "absent" })
  })

  it("records are never deleted one by one; only academy staff delete a whole register", async () => {
    await expect(run("admin", "delete from public.attendance_records")).rejects.toThrow(/permission denied/)

    const teacherDeleted = await as(db, ids.hung, async (tx) =>
      (await tx.query("delete from public.attendance_sessions returning id")).rows.length
    )
    expect(teacherDeleted).toBe(0)

    const left = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select id from public.attendance_sessions where class_id = $1 order by session_date desc limit 1",
        [classIds["TOAN6-2026A"]]
      )
      await tx.query("delete from public.attendance_sessions where id = $1", [rows[0].id])
      return (await tx.query("select 1 from public.attendance_records where session_id = $1", [rows[0].id])).rows.length
    })
    expect(left).toBe(0)
  })
})

describe("reports", () => {
  const summary = (tx: Session, groupBy: string, filters: { klass?: string; teacher?: string } = {}) =>
    tx.query<{ label: string; code: string; sessions: string; present: string; late: string; absent: string; excused: string; total: string }>(
      "select * from public.attendance_summary('2000-01-01', '2100-01-01', $1, $2, $3)",
      [groupBy, filters.klass ? classIds[filters.klass] : null, filters.teacher ?? null]
    )

  it("totals by class match the records and cover only what the caller may see", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const byClass = (await summary(tx, "class")).rows
      const records = Number((await tx.query<{ n: string }>("select count(*) as n from public.attendance_records")).rows[0].n)
      await switchUser(tx, ids.hung)
      const hungClasses = (await summary(tx, "class")).rows.map((r) => r.code)
      const hungStudents = (await summary(tx, "student")).rows.map((r) => r.code).sort()
      return { byClass, records, hungClasses, hungStudents }
    })
    expect(result.byClass.map((r) => r.code).sort()).toEqual(["FLY-2026A", "KET-2025B", "TOAN6-2026A"])
    expect(result.byClass.reduce((sum, r) => sum + Number(r.total), 0)).toBe(result.records)
    for (const r of result.byClass) {
      expect(Number(r.present) + Number(r.late) + Number(r.absent) + Number(r.excused)).toBe(Number(r.total))
    }
    expect(result.hungClasses).toEqual(["TOAN6-2026A"])
    expect(result.hungStudents).toEqual(["HS001", "HS003"])
  })

  it("by teacher: a class counts for each of its teachers", async () => {
    const rows = await as(db, ids.admin, async (tx) => (await summary(tx, "teacher")).rows)
    const byCode = Object.fromEntries(rows.map((r) => [r.code, Number(r.total)]))
    const perClass = await as(db, ids.admin, async (tx) =>
      Object.fromEntries((await summary(tx, "class")).rows.map((r) => [r.code, Number(r.total)]))
    )
    expect(byCode.GV001).toBe(perClass["TOAN6-2026A"])
    expect(byCode.GV002).toBe(perClass["FLY-2026A"] + perClass["KET-2025B"])
    expect(byCode.GV003).toBe(perClass["FLY-2026A"])
  })

  it("filters by class and teacher, and ignores unknown groupings", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const teacherId = (await tx.query<{ id: string }>("select id from public.teachers where teacher_code = 'GV001'")).rows[0].id
      return {
        byTeacher: (await summary(tx, "student", { teacher: teacherId })).rows.map((r) => r.code).sort(),
        byClass: (await summary(tx, "student", { klass: "FLY-2026A" })).rows.map((r) => r.code).sort(),
        unknown: (await summary(tx, "nonsense")).rows.length,
      }
    })
    expect(result).toEqual({ byTeacher: ["HS001", "HS003"], byClass: ["HS002", "HS004", "HS005"], unknown: 0 })
  })

  it("the weekly trend adds up to the same totals", async () => {
    const totals = await as(db, ids.admin, async (tx) => {
      const weeks = (await tx.query<{ week_start: string; present: string; late: string; absent: string; excused: string }>(
        "select to_char(week_start, 'YYYY-MM-DD') as week_start, present, late, absent, excused from public.attendance_trend('2000-01-01', '2100-01-01')"
      )).rows
      const records = Number((await tx.query<{ n: string }>("select count(*) as n from public.attendance_records")).rows[0].n)
      return { weeks, records }
    })
    expect(totals.weeks.reduce((sum, w) => sum + Number(w.present) + Number(w.late) + Number(w.absent) + Number(w.excused), 0)).toBe(
      totals.records
    )
    for (const w of totals.weeks) expect(new Date(`${w.week_start}T00:00:00Z`).getUTCDay()).toBe(1) // Mondays
  })

  it("students and parents get only their own figures from the report functions", async () => {
    const codes = async (who: Who) =>
      as(db, ids[who], async (tx) => (await summary(tx, "student")).rows.map((r) => r.code).sort())
    expect(await codes("huy")).toEqual(["HS001"])
    expect(await codes("lan")).toEqual(["HS001", "HS002"])
    expect(await codes("vinh")).toEqual([])
  })
})

describe("repeated absence warnings", () => {
  type Alert = { student_code: string; class_name: string; consecutive_absences: number; recent_absences: number }
  const alerts = (tx: Session) =>
    tx.query<Alert>("select student_code, class_name, consecutive_absences, recent_absences from public.attendance_alerts()")

  it("flags the seeded absence runs, per class", async () => {
    const rows = (await as(db, ids.admin, alerts)).rows
    expect(rows.find((r) => r.student_code === "HS003")).toMatchObject({ consecutive_absences: 3, recent_absences: 3 })
    expect(rows.find((r) => r.student_code === "HS002")).toMatchObject({ consecutive_absences: 2, recent_absences: 2 })
    // Late is not an absence; finished classes are not monitored; excused never counts.
    expect(rows.map((r) => r.student_code).sort()).toEqual(["HS002", "HS003"])
  })

  it("excused sessions neither count nor break a run; attending ends it", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      await save(tx, "TOAN6-2026A", today, [{ student: "HS003", status: "excused" }])
      const afterExcused = (await alerts(tx)).rows.find((r) => r.student_code === "HS003")
      await save(tx, "TOAN6-2026A", today, [{ student: "HS003", status: "present" }])
      const afterPresent = (await alerts(tx)).rows.find((r) => r.student_code === "HS003")
      return { afterExcused, afterPresent }
    })
    expect(result.afterExcused).toMatchObject({ consecutive_absences: 3 })
    expect(result.afterPresent).toMatchObject({ consecutive_absences: 0, recent_absences: 3 })
  })

  it.each([
    ["hung", ["HS003"]],
    ["ha", ["HS002"]],
    ["lan", ["HS002"]],
    ["duc", ["HS003"]],
    ["huy", []],
    ["vinh", []],
  ] as const)("%s sees warnings for their own students only", async (who, expected) => {
    const rows = (await as(db, ids[who], alerts)).rows
    expect(rows.map((r) => r.student_code).sort()).toEqual([...expected])
  })
})
