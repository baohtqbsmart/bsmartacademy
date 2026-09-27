import { beforeAll, describe, expect, it } from "vitest"

import { as, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán: HS001 Huy, HS003 Châu
  ha: "gv.ha@bsmart.test", // Flyers (HS002, HS005) and KET (HS001)
  tuan: "gv.tuan@bsmart.test", // Flyers assistant
  lan: "ph.lan@bsmart.test", // parent of HS001 + HS002
  duc: "ph.duc@bsmart.test", // parent of HS003
  huy: "hs.huy@bsmart.test",
  chau: "hs.chau@bsmart.test",
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

const rows = async (tx: Session, sql: string, params: unknown[] = []) => (await tx.query(sql, params)).rows.length
const one = async (tx: Session, sql: string, params: unknown[] = []) => Object.values((await tx.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0]
async function rejects(tx: Session, sql: string, params: unknown[], pattern: RegExp) {
  await tx.exec("savepoint s")
  await expect(tx.query(sql, params)).rejects.toThrow(pattern)
  await tx.exec("rollback to savepoint s")
}
/** Notifications of a kind per person, counted as the database owner. */
async function received(tx: Session, kind: string, since: string) {
  await tx.exec("reset role")
  const { rows: r } = await tx.query<{ email: string }>(
    "select p.email from public.notifications n join public.profiles p on p.id = n.user_id where n.kind = $1 and n.created_at >= $2 order by 1",
    [kind, since]
  )
  await tx.exec("set local role authenticated")
  return [...new Set(r.map((x) => Object.entries(EMAILS).find(([, e]) => e === x.email)?.[0] ?? x.email))].sort()
}
// Rows get the transaction's start time, which is later than anything in the seed.
const now = async (tx: Session) => (await one(tx, "select now()::text")) as string

describe("notifications are private", () => {
  it("each person sees only their own, can only mark them read, and cannot create them", async () => {
    await as(db, ids.lan, async (tx) => {
      const mine = await rows(tx, "select 1 from public.notifications")
      expect(mine).toBeGreaterThan(0)
      expect(await rows(tx, "select 1 from public.notifications where user_id <> $1", [ids.lan])).toBe(0)
      expect(await rows(tx, "update public.notifications set read_at = now() returning 1")).toBe(mine)
      await rejects(tx, "update public.notifications set title = 'x'", [], /permission denied/)
      await rejects(tx, "insert into public.notifications (user_id, kind, title) values ($1, 'system', 'fake')", [ids.duc], /permission denied/)
      await switchUser(tx, ids.duc)
      expect(await rows(tx, "delete from public.notifications where user_id = $1 returning 1", [ids.lan])).toBe(0)
    })
  })

  it("links are internal paths only", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.exec("reset role")
      await rejects(tx, "insert into public.notifications (user_id, kind, title, link) values ($1, 'system', 'x', 'javascript:alert(1)')", [ids.lan], /check constraint/)
      await rejects(tx, "insert into public.notifications (user_id, kind, title, link) values ($1, 'system', 'x', '//evil.test')", [ids.lan], /check constraint/)
    })
  })
})

describe("system notifications reach the right families", () => {
  it("new assignment: the class's students and their parents only", async () => {
    await as(db, ids.ha, async (tx) => {
      const since = await now(tx)
      await tx.query("insert into public.assignments (class_id, title, instructions, assignment_type, status, due_at) values ($1, 'Unit 5 words', 'Learn the words.', 'vocabulary', 'published', now() + interval '3 days')", [classIds["FLY-2026A"]])
      expect(await received(tx, "new_assignment", since)).toEqual(["lan"])
    })
  })

  it("returned grade: the student and their parents; not before it is returned", async () => {
    await as(db, ids.hung, async (tx) => {
      const since = await now(tx)
      const assignment = await one(tx, "select id from public.assignments where title = 'Bài tập Phân số – tuần 3'")
      expect(await received(tx, "new_grade", since)).toEqual([])
      await tx.query("select public.return_grades($1)", [assignment])
      expect(await received(tx, "new_grade", since)).toEqual(["chau", "duc"])
    })
  })

  it("absence: the student's family only", async () => {
    await as(db, ids.hung, async (tx) => {
      const since = await now(tx)
      await tx.query("select public.save_attendance($1, private.academy_today(), $2)", [
        classIds["TOAN6-2026A"],
        JSON.stringify([{ student_id: studentIds.HS001, status: "absent" }, { student_id: studentIds.HS003, status: "present" }]),
      ])
      expect(await received(tx, "absence", since)).toEqual(["huy", "lan"])
    })
  })

  it("preferences: a switched-off kind is not created; system notices cannot be switched off", async () => {
    await as(db, ids.lan, async (tx) => {
      await tx.query("insert into public.notification_preferences (user_id, kind, enabled) values ($1, 'absence', false)", [ids.lan])
      await rejects(tx, "insert into public.notification_preferences (user_id, kind, enabled) values ($1, 'system', false)", [ids.lan], /check constraint/)
      await rejects(tx, "insert into public.notification_preferences (user_id, kind, enabled) values ($1, 'absence', false)", [ids.duc], /row-level security/)
      await switchUser(tx, ids.hung)
      const since = await now(tx)
      await tx.query("select public.save_attendance($1, private.academy_today(), $2)", [
        classIds["TOAN6-2026A"],
        JSON.stringify([{ student_id: studentIds.HS001, status: "absent" }, { student_id: studentIds.HS003, status: "absent" }]),
      ])
      expect(await received(tx, "absence", since)).toEqual(["chau", "duc", "huy"])
    })
  })

  it("schedule change: a cancelled online lesson reaches its class's families", async () => {
    await as(db, ids.ha, async (tx) => {
      const since = await now(tx)
      const session = await one(tx, "select id from public.online_sessions where status = 'scheduled' and class_id = $1 limit 1", [classIds["FLY-2026A"]])
      await tx.query("update public.online_sessions set status = 'cancelled', cancelled_reason = 'Giáo viên ốm' where id = $1", [session])
      expect(await received(tx, "schedule_change", since)).toEqual(["lan"])
    })
  })
})

describe("announcements", () => {
  const titles = async (tx: Session) => ((await tx.query<{ title: string }>("select title from public.announcements order by title")).rows).map((r) => r.title)

  it("each audience sees what is meant for it", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.query("insert into public.announcements (audience, title, body) values ('staff', 'Staff meeting', 'x'), ('students', 'Student club', 'x'), ('everyone', 'Holiday', 'x')")
      const seen: Record<string, string[]> = {}
      for (const who of ["lan", "duc", "huy", "ha", "hung"] as const) {
        await switchUser(tx, ids[who])
        seen[who] = await titles(tx)
      }
      expect(seen).toEqual({
        lan: ["Holiday", "Họp phụ huynh cuối tháng 10", "Mang theo sách Flyers Unit 5"],
        duc: ["Holiday", "Họp phụ huynh cuối tháng 10"],
        huy: ["Holiday", "Student club"],
        ha: ["Holiday", "Mang theo sách Flyers Unit 5", "Staff meeting"],
        hung: ["Holiday", "Staff meeting"],
      })
    })
  })

  it("a new announcement notifies its audience only", async () => {
    await as(db, ids.admin, async (tx) => {
      const since = await now(tx)
      await tx.query("insert into public.announcements (audience, title, body) values ('parents', 'Tuition reminder', 'x')")
      expect(await received(tx, "new_announcement", since)).toEqual(["duc", "lan"])
    })
  })

  it("teachers announce only to classes they teach; families never", async () => {
    await as(db, ids.ha, async (tx) => {
      await rejects(tx, "insert into public.announcements (audience, title, body) values ('everyone', 'x', 'x')", [], /row-level security/)
      await rejects(tx, "insert into public.announcements (audience, class_id, title, body) values ('class', $1, 'x', 'x')", [classIds["TOAN6-2026A"]], /row-level security/)
    })
    for (const who of ["lan", "huy"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "insert into public.announcements (audience, title, body) values ('parents', 'x', 'x')", [], /row-level security/))
  })

  it("archived and expired announcements disappear for the audience, not the author", async () => {
    await as(db, ids.ha, async (tx) => {
      await tx.query("update public.announcements set archived_at = now() where title = 'Mang theo sách Flyers Unit 5'")
      expect(await rows(tx, "select 1 from public.announcements where title = 'Mang theo sách Flyers Unit 5'")).toBe(1)
      await switchUser(tx, ids.lan)
      expect(await rows(tx, "select 1 from public.announcements where title = 'Mang theo sách Flyers Unit 5'")).toBe(0)
      await switchUser(tx, ids.lan)
      await switchUser(tx, ids.hung)
      expect(await rows(tx, "update public.announcements set title = 'hijack' where title = 'Họp phụ huynh cuối tháng 10' returning 1")).toBe(0)
    })
  })
})

describe("teacher–parent messages", () => {
  const start = (tx: Session, student: string, teacher: Who, parent: Who) =>
    tx.query<{ id: string }>("insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3) returning id", [studentIds[student], ids[teacher], ids[parent]])

  it("only between a child's teacher and that child's parent", async () => {
    await as(db, ids.hung, async (tx) => {
      expect((await start(tx, "HS001", "hung", "lan")).rows).toHaveLength(1) // Hùng teaches Huy
      await rejects(tx, "insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3)", [studentIds.HS002, ids.hung, ids.lan], /row-level security/) // not Ngọc Anh's teacher
      await rejects(tx, "insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3)", [studentIds.HS001, ids.hung, ids.duc], /row-level security/) // Đức is not Huy's parent
      await rejects(tx, "insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3)", [studentIds.HS001, ids.ha, ids.lan], /row-level security/) // not a participant
    })
    await as(db, ids.duc, async (tx) => {
      expect((await start(tx, "HS003", "hung", "duc")).rows).toHaveLength(1) // a parent may start too
      await rejects(tx, "insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3)", [studentIds.HS001, ids.hung, ids.duc], /row-level security/)
    })
    for (const who of ["huy", "chau"] as const)
      await as(db, ids[who], (tx) => rejects(tx, "insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values ($1, $2, $3)", [studentIds.HS001, ids.hung, ids.lan], /row-level security/))
  })

  it("conversations are visible to their two participants (and administrators) only", async () => {
    const seen: Record<string, number> = {}
    for (const who of ["ha", "lan", "admin", "hung", "tuan", "duc", "huy"] as const)
      seen[who] = await as(db, ids[who], (tx) => rows(tx, "select 1 from public.messages"))
    expect(seen).toEqual({ ha: 2, lan: 2, admin: 2, hung: 0, tuan: 0, duc: 0, huy: 0 })
    // The conversation itself (who writes to whom about which child) is just as private.
    const threads: Record<string, number> = {}
    for (const who of ["ha", "lan", "admin", "hung", "tuan", "duc", "huy"] as const)
      threads[who] = await as(db, ids[who], (tx) => rows(tx, "select 1 from public.message_threads"))
    expect(threads).toEqual({ ha: 1, lan: 1, admin: 1, hung: 0, tuan: 0, duc: 0, huy: 0 })
  })

  it("messages are stamped with the sender, notify the other side and cannot be edited", async () => {
    await as(db, ids.lan, async (tx) => {
      const thread = await one(tx, "select id from public.message_threads")
      const since = await now(tx)
      const id = await one(tx, "insert into public.messages (thread_id, body) values ($1, '  Dạ vâng ạ.  ') returning id", [thread])
      expect(await one(tx, "select sender_id from public.messages where id = $1", [id])).toBe(ids.lan)
      expect(await one(tx, "select body from public.messages where id = $1", [id])).toBe("Dạ vâng ạ.")
      expect(await received(tx, "message", since)).toEqual(["ha"])
      await rejects(tx, "update public.messages set body = 'changed' where id = $1", [id], /permission denied/)
      await rejects(tx, "insert into public.messages (thread_id, body, sender_id) values ($1, 'x', $2)", [thread, ids.ha], /permission denied/)
      await switchUser(tx, ids.admin)
      await rejects(tx, "insert into public.messages (thread_id, body) values ($1, 'x')", [thread], /row-level security/)
    })
  })

  it("reading a conversation marks it and its notifications read", async () => {
    await as(db, ids.lan, async (tx) => {
      const thread = await one(tx, "select id from public.message_threads")
      await tx.query("select public.mark_thread_read($1)", [thread])
      expect(await one(tx, "select parent_read_at is not null from public.message_threads where id = $1", [thread])).toBe(true)
      expect(await rows(tx, "select 1 from public.notifications where kind = 'message' and read_at is null")).toBe(0)
    })
  })

  it("when the child leaves the class, the conversation stays readable but closed", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.exec("reset role")
      await tx.query("update public.enrollments set status = 'withdrawn', ended_on = private.academy_today() where student_id = $1 and class_id = $2", [studentIds.HS002, classIds["FLY-2026A"]])
      await tx.exec("set local role authenticated")
      await switchUser(tx, ids.ha)
      const thread = await one(tx, "select id from public.message_threads")
      expect(await rows(tx, "select 1 from public.messages")).toBe(2)
      await rejects(tx, "insert into public.messages (thread_id, body) values ($1, 'x')", [thread], /row-level security/)
    })
  })
})

describe("reminders created when the app opens", () => {
  it("homework due within a day, once, for the family that has not handed it in", async () => {
    await as(db, ids.ha, async (tx) => {
      await tx.query("insert into public.assignments (class_id, title, instructions, assignment_type, status, due_at) values ($1, 'Due tonight', 'Do page 12.', 'homework', 'published', now() + interval '10 hours')", [classIds["FLY-2026A"]])
      await switchUser(tx, ids.lan)
      const since = await now(tx)
      expect(Number(await one(tx, "select public.sync_my_notifications()"))).toBeGreaterThanOrEqual(1)
      expect(Number(await one(tx, "select public.sync_my_notifications()"))).toBe(0)
      expect(await rows(tx, "select 1 from public.notifications where kind = 'homework_due' and created_at >= $1 and student_id = $2", [since, studentIds.HS002])).toBe(1)
      // Đức's children are not in Flyers: his sync may create other reminders (Châu's overdue fees), never this one.
      await switchUser(tx, ids.duc)
      await tx.query("select public.sync_my_notifications()")
      expect(await rows(tx, "select 1 from public.notifications where kind = 'homework_due' and title = 'Due soon: Due tonight'")).toBe(0)
      expect(await rows(tx, "select 1 from public.notifications where kind = 'tuition_due'")).toBeGreaterThan(0)
    })
  })

  it("tuition due within a week reaches the parent, not the student", async () => {
    await as(db, ids.admin, async (tx) => {
      await tx.query("insert into public.invoices (student_id, description, amount, due_date) values ($1, 'Học phí tháng 10', 1500000, private.academy_today() + 3)", [studentIds.HS001])
      await switchUser(tx, ids.lan)
      await tx.query("select public.sync_my_notifications()")
      expect(await rows(tx, "select 1 from public.notifications where kind = 'tuition_due' and title like '%' and student_id = $1", [studentIds.HS001])).toBeGreaterThanOrEqual(1)
      await switchUser(tx, ids.huy)
      await tx.query("select public.sync_my_notifications()")
      expect(await rows(tx, "select 1 from public.notifications where kind = 'tuition_due'")).toBe(0)
    })
  })
})

describe("what a parent must not do or see", () => {
  const otherChild: [string, string][] = [
    ["students", "id"],
    ["enrollments", "student_id"],
    ["attendance_records", "student_id"],
    ["submissions", "student_id"],
    ["test_attempts", "student_id"],
    ["lesson_attempts", "student_id"],
    ["lesson_submissions", "student_id"],
    ["assessment_submissions", "student_id"],
    ["invoices", "student_id"],
    ["payments", "student_id"],
    ["student_feedback", "student_id"],
    ["vocabulary_practice", "student_id"],
    ["notifications", "student_id"],
  ]

  it.each(otherChild)("Lan sees no %s row of Châu (another family's child)", async (table, column) => {
    expect(await as(db, ids.lan, (tx) => rows(tx, `select 1 from public.${table} where ${column} = $1`, [studentIds.HS003]))).toBe(0)
  })

  it.each(["bank_questions", "bank_question_keys", "test_question_keys", "assignment_answer_keys", "lesson_question_keys", "online_session_notes", "feedback_comments", "assessment_rubrics", "library_folders"])(
    "Lan sees nothing in the teacher-only %s",
    async (table) => {
      expect(await as(db, ids.lan, (tx) => rows(tx, `select 1 from public.${table}`))).toBe(0)
    }
  )

  it("Lan cannot change grades or attendance, even for her own child", async () => {
    await as(db, ids.lan, async (tx) => {
      const grade = await one(tx, "select submission_id from public.submission_grades limit 1")
      expect(grade).toBeTruthy()
      await tx.exec("savepoint g")
      const updated = await tx.query("update public.submission_grades set score = 10 where submission_id = $1 returning 1", [grade]).then(
        (r) => r.rows.length,
        () => 0
      )
      await tx.exec("rollback to savepoint g")
      expect(updated).toBe(0)
      await rejects(tx, "select public.grade_submission($1, 10, 'x')", [grade], /./)
      const record = await one(tx, "select id from public.attendance_records where student_id = $1 limit 1", [studentIds.HS001])
      expect(record).toBeTruthy()
      await tx.exec("savepoint a")
      const changed = await tx.query("update public.attendance_records set status = 'present' where id = $1 returning 1", [record]).then(
        (r) => r.rows.length,
        () => 0
      )
      await tx.exec("rollback to savepoint a")
      expect(changed).toBe(0)
      await rejects(tx, "select public.save_attendance($1, private.academy_today(), '[]')", [classIds["FLY-2026A"]], /./)
    })
  })

  it("Lan does not see grades her child's teacher has not returned", async () => {
    await as(db, ids.hung, async (tx) => {
      // Grade Huy's work again without returning: the parent must not see the new score.
      const sub = await one(tx, "select s.id from public.submissions s where s.student_id = $1 limit 1", [studentIds.HS001])
      await tx.exec("reset role")
      await tx.query("update public.submission_grades set returned_at = null where submission_id = $1", [sub])
      await tx.exec("set local role authenticated")
      await switchUser(tx, ids.lan)
      expect(await rows(tx, "select 1 from public.submission_grades where submission_id = $1", [sub])).toBe(0)
    })
  })
})
