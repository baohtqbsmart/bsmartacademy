import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type TestDb } from "./harness"

const EMAILS = {
  superAdmin: "superadmin@bsmart.test",
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test",
  ha: "gv.ha@bsmart.test",
  lan: "ph.lan@bsmart.test",
  duc: "ph.duc@bsmart.test",
  huy: "hs.huy@bsmart.test",
  chau: "hs.chau@bsmart.test",
  vinh: "gv.vinh@bsmart.test",
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const studentIds: Record<string, string> = {}
const classIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const row of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows) {
    studentIds[row.student_code] = row.id
  }
  for (const row of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) {
    classIds[row.code] = row.id
  }
})

const directory = (who: Who) =>
  as(db, ids[who], (tx) => column(tx, "select student_code from public.student_directory where deleted_at is null"))

describe("student_directory view respects RLS", () => {
  it.each([
    ["admin", ["HS001", "HS002", "HS003", "HS004", "HS005"]],
    ["hung", ["HS001", "HS003"]],
    ["ha", ["HS001", "HS002", "HS005"]],
    ["lan", ["HS001", "HS002"]],
    ["duc", ["HS003"]],
    ["huy", ["HS001"]],
    ["chau", ["HS003"]],
    ["vinh", []],
  ] as const)("%s sees %j", async (who, expected) => {
    expect(await directory(who)).toEqual(expected)
  })

  it("anonymous users cannot read it", async () => {
    await expect(as(db, null, (tx) => tx.query("select * from public.student_directory"))).rejects.toThrow(
      /permission denied/
    )
  })

  it("derives current classes and primary parent", async () => {
    const { rows } = await as(db, ids.admin, (tx) =>
      tx.query<{ current_class_names: string; primary_parent_name: string }>(
        "select current_class_names, primary_parent_name from public.student_directory where student_code = 'HS001'"
      )
    )
    // KET-2025B is completed, so only the active class counts as current.
    expect(rows[0]).toEqual({ current_class_names: "Toán 6 nâng cao – 2026A", primary_parent_name: "Bùi Thị Lan" })
  })

  it("only shows the classes the caller may see", async () => {
    const { rows } = await as(db, ids.ha, (tx) =>
      tx.query<{ current_class_names: string | null }>(
        "select current_class_names from public.student_directory where student_code = 'HS001'"
      )
    )
    // Hà teaches HS001 in the completed KET class but not in TOAN6.
    expect(rows[0].current_class_names).toBeNull()
  })

  it("supports accent-insensitive search", async () => {
    const found = await as(db, ids.admin, (tx) =>
      column(tx, "select student_code from public.student_directory where search_text like '%' || $1 || '%'", [
        "nguyen",
      ])
    )
    expect(found).toEqual(["HS001", "HS002"])
  })

  it("filters by current class", async () => {
    const found = await as(db, ids.admin, (tx) =>
      column(tx, "select student_code from public.student_directory where current_class_ids @> array[$1]::uuid[]", [
        classIds["FLY-2026A"],
      ])
    )
    expect(found).toEqual(["HS002", "HS005"])
  })

  it("is read-only", async () => {
    await expect(
      as(db, ids.admin, (tx) => tx.query("update public.student_directory set full_name = 'x'"))
    ).rejects.toThrow(/permission denied|cannot update view/)
  })
})

describe("student records", () => {
  it("generates a student code when none is given", async () => {
    const { rows } = await as(db, ids.admin, (tx) =>
      tx.query<{ student_code: string }>(
        "insert into public.students (full_name) values ('Phan Thị Mai') returning student_code"
      )
    )
    expect(rows[0].student_code).toMatch(/^HS\d{4}$/)
  })

  it("validates email, phone and level references", async () => {
    const attempt = (sql: string) => as(db, ids.admin, (tx) => tx.query(sql))
    await expect(attempt("insert into public.students (full_name, email) values ('A', 'not-an-email')")).rejects.toThrow(
      /check constraint/
    )
    await expect(attempt("insert into public.students (full_name, phone) values ('A', 'call me')")).rejects.toThrow(
      /check constraint/
    )
    await expect(
      attempt("insert into public.students (full_name, english_level_code) values ('A', 'SUPERHERO')")
    ).rejects.toThrow(/foreign key/)
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot edit student details", async (who) => {
    const { rows } = await as(db, ids[who], (tx) =>
      tx.query("update public.students set english_level_code = 'C2' where student_code = 'HS001' returning id")
    )
    expect(rows).toHaveLength(0)
  })

  it("archiving hides the student from teachers and parents but not admins", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.students set deleted_at = now() where student_code = 'HS001'")
      const admin = await column(tx, "select student_code from public.students where student_code = 'HS001'")
      await switchUser(tx, ids.hung)
      const teacher = await column(tx, "select student_code from public.students where student_code = 'HS001'")
      await switchUser(tx, ids.lan)
      const parent = await column(tx, "select student_code from public.students")
      return { admin, teacher, parent }
    })
    expect(seen).toEqual({ admin: ["HS001"], teacher: [], parent: ["HS002"] })
  })

  it("english levels are readable by every signed-in role and editable only by admins", async () => {
    const count = (who: Who) =>
      as(db, ids[who], async (tx) => (await tx.query("select 1 from public.english_levels")).rows.length)
    expect(await count("huy")).toBe(29)
    await expect(
      as(db, ids.hung, (tx) =>
        tx.query("insert into public.english_levels (code, framework, name, sort_order) values ('X1', 'cefr', 'X', 999)")
      )
    ).rejects.toThrow(/row-level security/)
  })
})

describe("enrolment RPCs", () => {
  const enroll = (who: Who, student: string, klass: string) =>
    as(db, ids[who], async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.enroll_student($1, $2) as id", [
        studentIds[student],
        classIds[klass],
      ])
      return rows[0].id
    })

  it("admin can enrol a student", async () => {
    await expect(enroll("admin", "HS003", "FLY-2026A")).resolves.toMatch(/-/)
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot enrol students", async (who) => {
    await expect(enroll(who, "HS003", "FLY-2026A")).rejects.toThrow(/permission to manage enrolments/)
  })

  it("rejects a duplicate active enrolment", async () => {
    await expect(enroll("admin", "HS001", "TOAN6-2026A")).rejects.toThrow(/already enrolled/)
  })

  it("re-enrolling a withdrawn student reactivates their record", async () => {
    const status = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.enroll_student($1, $2) as id", [
        studentIds.HS004,
        classIds["FLY-2026A"],
      ])
      const after = await tx.query<{ status: string; ended_on: string | null; n: number }>(
        "select status, ended_on, (select count(*)::int from public.enrollments where student_id = $2) as n from public.enrollments where id = $1",
        [rows[0].id, studentIds.HS004]
      )
      return after.rows[0]
    })
    expect(status).toEqual({ status: "active", ended_on: null, n: 1 })
  })

  it("still enforces capacity", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.classes set capacity = 2 where code = 'FLY-2026A'")
        await tx.query("select public.enroll_student($1, $2)", [studentIds.HS003, classIds["FLY-2026A"]])
      })
    ).rejects.toThrow(/class is full/)
  })

  it("completing an enrolment records the end date", async () => {
    const row = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select id from public.enrollments where student_id = $1 and class_id = $2",
        [studentIds.HS003, classIds["TOAN6-2026A"]]
      )
      await tx.query("select public.set_enrollment_status($1, 'completed')", [rows[0].id])
      return (await tx.query<{ status: string; ended: boolean }>(
        "select status, ended_on is not null as ended from public.enrollments where id = $1",
        [rows[0].id]
      )).rows[0]
    })
    expect(row).toEqual({ status: "completed", ended: true })
  })

  it("transfer moves the student atomically and updates teacher access", async () => {
    const result = await as(db, ids.admin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select id from public.enrollments where student_id = $1 and class_id = $2",
        [studentIds.HS003, classIds["TOAN6-2026A"]]
      )
      await tx.query("select public.transfer_enrollment($1, $2)", [rows[0].id, classIds["FLY-2026A"]])
      const statuses = await column(
        tx,
        "select c.code || ':' || e.status from public.enrollments e join public.classes c on c.id = e.class_id where e.student_id = $1",
        [studentIds.HS003]
      )
      await switchUser(tx, ids.hung)
      const hung = await column(tx, "select student_code from public.students where student_code = 'HS003'")
      await switchUser(tx, ids.ha)
      const ha = await column(tx, "select student_code from public.students where student_code = 'HS003'")
      return { statuses, hung, ha }
    })
    expect(result).toEqual({
      statuses: ["FLY-2026A:active", "TOAN6-2026A:withdrawn"],
      hung: [],
      ha: ["HS003"],
    })
  })

  it("cannot transfer into the same class or transfer a finished enrolment", async () => {
    const enrollmentId = async (student: string, klass: string) =>
      (await db.query<{ id: string }>("select id from public.enrollments where student_id = $1 and class_id = $2", [
        studentIds[student],
        classIds[klass],
      ])).rows[0].id
    const same = await enrollmentId("HS001", "TOAN6-2026A")
    const finished = await enrollmentId("HS001", "KET-2025B")
    await expect(
      as(db, ids.admin, (tx) => tx.query("select public.transfer_enrollment($1, $2)", [same, classIds["TOAN6-2026A"]]))
    ).rejects.toThrow(/already in this class/)
    await expect(
      as(db, ids.admin, (tx) => tx.query("select public.transfer_enrollment($1, $2)", [finished, classIds["FLY-2026A"]]))
    ).rejects.toThrow(/Only current enrolments/)
  })
})

describe("teacher feedback", () => {
  // Reads student_feedback alone (no join to students, whose own RLS would
  // mask a leaky feedback policy) and maps ids to codes outside the session.
  const feedbackFor = async (who: Who) => {
    const rows = await as(db, ids[who], async (tx) =>
      (await tx.query<{ student_id: string; author_name: string }>(
        "select student_id, author_name from public.student_feedback"
      )).rows
    )
    const codeOf = (id: string) => Object.entries(studentIds).find(([, value]) => value === id)![0]
    return rows.map((row) => `${codeOf(row.student_id)}:${row.author_name}`).sort()
  }

  it("records the author from the session", async () => {
    expect(await feedbackFor("admin")).toEqual([
      "HS001:Lê Văn Hùng",
      "HS002:Phạm Thu Hà",
      "HS003:Lê Văn Hùng",
    ])
  })

  it.each([
    ["hung", ["HS001:Lê Văn Hùng", "HS003:Lê Văn Hùng"]],
    // Hà also teaches HS001 (KET), so she sees every teacher's feedback on HS001.
    ["ha", ["HS001:Lê Văn Hùng", "HS002:Phạm Thu Hà"]],
    ["lan", ["HS001:Lê Văn Hùng", "HS002:Phạm Thu Hà"]],
    ["duc", ["HS003:Lê Văn Hùng"]],
    ["huy", ["HS001:Lê Văn Hùng"]],
    ["chau", ["HS003:Lê Văn Hùng"]],
    ["vinh", []],
  ] as const)("%s sees only feedback on students they may see", async (who, expected) => {
    expect(await feedbackFor(who)).toEqual(expected)
  })

  it("teacher can write feedback for a student they teach, not for others", async () => {
    await expect(
      as(db, ids.hung, (tx) =>
        tx.query("insert into public.student_feedback (student_id, body) values ($1, 'Tiến bộ tốt.')", [studentIds.HS001])
      )
    ).resolves.toBeDefined()
    await expect(
      as(db, ids.hung, (tx) =>
        tx.query("insert into public.student_feedback (student_id, body) values ($1, 'x')", [studentIds.HS002])
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("the author cannot be spoofed", async () => {
    const author = await as(db, ids.hung, async (tx) => {
      const { rows } = await tx.query<{ author_profile_id: string; author_name: string }>(
        "insert into public.student_feedback (student_id, body, author_profile_id, author_name) values ($1, 'x', $2, 'Admin') returning author_profile_id, author_name",
        [studentIds.HS001, ids.admin]
      )
      return rows[0]
    })
    expect(author).toEqual({ author_profile_id: ids.hung, author_name: "Lê Văn Hùng" })
  })

  it.each(["lan", "huy"] as const)("%s cannot write feedback", async (who) => {
    await expect(
      as(db, ids[who], (tx) =>
        tx.query("insert into public.student_feedback (student_id, body) values ($1, 'x')", [studentIds.HS001])
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("teachers cannot edit another teacher's feedback; admins can archive any", async () => {
    const edited = await as(db, ids.ha, (tx) =>
      tx.query("update public.student_feedback set body = 'changed' where author_name = 'Lê Văn Hùng' returning id")
    )
    expect(edited.rows).toHaveLength(0)

    const parentView = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.student_feedback set deleted_at = now() where author_name = 'Lê Văn Hùng'")
      await switchUser(tx, ids.lan)
      return column(tx, "select author_name from public.student_feedback")
    })
    expect(parentView).toEqual(["Phạm Thu Hà"])
  })

  it("feedback cannot be hard-deleted", async () => {
    await expect(as(db, ids.admin, (tx) => tx.query("delete from public.student_feedback"))).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("student photos", () => {
  const upload = (who: Who, student: string) =>
    as(db, ids[who], (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('student-photos', $1)", [`${studentIds[student]}/photo`])
    )

  it("only roles that edit students can upload", async () => {
    await expect(upload("admin", "HS001")).resolves.toBeDefined()
    for (const who of ["hung", "lan", "huy"] as const) {
      await expect(upload(who, "HS001")).rejects.toThrow(/row-level security/)
    }
  })

  it("photos are readable exactly where the student is visible", async () => {
    const visible = await as(db, ids.admin, async (tx) => {
      for (const code of ["HS001", "HS002", "HS003"]) {
        await tx.query("insert into storage.objects (bucket_id, name) values ('student-photos', $1)", [`${studentIds[code]}/photo`])
      }
      const names = async () => {
        const { rows } = await tx.query<{ name: string }>("select name from storage.objects where bucket_id = 'student-photos'")
        return rows.map((r) => Object.entries(studentIds).find(([, id]) => r.name.startsWith(id))![0]).sort()
      }
      const result: Record<string, string[]> = {}
      for (const who of ["hung", "lan", "chau"] as const) {
        await switchUser(tx, ids[who])
        result[who] = await names()
      }
      return result
    })
    expect(visible).toEqual({ hung: ["HS001", "HS003"], lan: ["HS001", "HS002"], chau: ["HS003"] })
  })
})
