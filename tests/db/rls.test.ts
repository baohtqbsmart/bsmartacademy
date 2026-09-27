import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  superAdmin: "superadmin@bsmart.test",
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // teaches TOAN6-2026A
  ha: "gv.ha@bsmart.test", // leads FLY-2026A and KET-2025B (completed)
  tuan: "gv.tuan@bsmart.test", // assistant in FLY-2026A
  vinh: "gv.vinh@bsmart.test", // deactivated account
  lan: "ph.lan@bsmart.test", // mother of HS001, HS002
  duc: "ph.duc@bsmart.test", // father of HS003
  huy: "hs.huy@bsmart.test", // HS001: TOAN6 active, KET completed
  chau: "hs.chau@bsmart.test", // HS003: TOAN6 active
  khang: "hs.khang@bsmart.test", // HS004: withdrawn from FLY
} as const

type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
let enrollmentLabels: Record<string, string>

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) {
    ids[who as Who] = await userId(db, email)
  }
  const { rows } = await db.query<{ id: string; label: string }>(`
    select e.id, s.student_code || '@' || c.code as label
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join public.classes c on c.id = e.class_id`)
  enrollmentLabels = Object.fromEntries(rows.map((r) => [r.id, r.label]))
})

async function visibleTo(who: Who) {
  return as(db, ids[who], async (tx) => ({
    students: await column(tx, "select student_code from public.students"),
    teachers: await column(tx, "select teacher_code from public.teachers"),
    parents: await column(tx, "select full_name from public.parents"),
    classes: await column(tx, "select code from public.classes"),
    courses: await column(tx, "select code from public.courses"),
    enrollments: (await column(tx, "select id from public.enrollments"))
      .map((id) => enrollmentLabels[id])
      .sort(),
    profiles: (await column(tx, "select email from public.profiles")).length,
  }))
}

const ALL_COURSES = ["ANH-FLYERS", "ANH-KET", "TOAN6-NC"]
const ALL_ENROLLMENTS = [
  "HS001@KET-2025B",
  "HS001@TOAN6-2026A",
  "HS002@FLY-2026A",
  "HS003@TOAN6-2026A",
  "HS004@FLY-2026A",
  "HS005@FLY-2026A",
  "HS006@TOAN6-2026A",
]

describe("schema", () => {
  it("defines exactly the five roles, ranked", async () => {
    const { rows } = await db.query("select code from public.roles order by rank desc")
    expect(rows.map((r) => (r as { code: string }).code)).toEqual([
      "super_admin",
      "admin",
      "teacher",
      "parent",
      "student",
    ])
  })

  it("enables RLS on every public table", async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(rows).toEqual([])
  })

  it("creates a profile for every seeded account with the role from app_metadata", async () => {
    const { rows } = await db.query<{ email: string; role_code: string }>(
      "select email, role_code from public.profiles where email in ($1, $2, $3)",
      [EMAILS.superAdmin, EMAILS.hung, EMAILS.lan]
    )
    expect(Object.fromEntries(rows.map((r) => [r.email, r.role_code]))).toEqual({
      [EMAILS.superAdmin]: "super_admin",
      [EMAILS.hung]: "teacher",
      [EMAILS.lan]: "parent",
    })
  })
})

describe("anonymous access", () => {
  const tables = [
    "profiles",
    "roles",
    "role_permissions",
    "students",
    "parents",
    "teachers",
    "student_parents",
    "subjects",
    "levels",
    "courses",
    "classes",
    "class_members",
    "enrollments",
  ]

  it.each(tables)("cannot read public.%s", async (table) => {
    await expect(as(db, null, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
      /permission denied/
    )
  })

  it("cannot call RPCs", async () => {
    await expect(as(db, null, (tx) => tx.query("select * from public.my_permissions()"))).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("row visibility per role", () => {
  it("super admin sees everything, including archived records", async () => {
    const seen = await visibleTo("superAdmin")
    expect(seen.students).toEqual(["HS001", "HS002", "HS003", "HS004", "HS005", "HS006"])
    expect(seen.teachers).toEqual(["GV001", "GV002", "GV003", "GV004"])
    expect(seen.classes).toEqual(["FLY-2026A", "KET-2025B", "TOAN6-2026A"])
    expect(seen.enrollments).toEqual(ALL_ENROLLMENTS)
    expect(seen.profiles).toBe(11)
  })

  it("admin sees everything operational", async () => {
    const seen = await visibleTo("admin")
    expect(seen.students).toHaveLength(6)
    expect(seen.parents).toHaveLength(4)
    expect(seen.enrollments).toEqual(ALL_ENROLLMENTS)
    expect(seen.profiles).toBe(11)
  })

  it("teacher sees only their class, its live students and those students' parents", async () => {
    expect(await visibleTo("hung")).toEqual({
      students: ["HS001", "HS003"], // HS006 is archived
      teachers: ["GV001"],
      parents: ["Bùi Thị Lan", "Hoàng Văn Đức", "Nguyễn Văn Phúc"],
      classes: ["TOAN6-2026A"],
      courses: ALL_COURSES,
      enrollments: ["HS001@TOAN6-2026A", "HS003@TOAN6-2026A"],
      profiles: 1,
    })
  })

  it("teacher keeps access to completed classes but not to withdrawn students", async () => {
    expect(await visibleTo("ha")).toEqual({
      students: ["HS001", "HS002", "HS005"], // HS004 withdrew
      teachers: ["GV002"],
      parents: ["Bùi Thị Lan", "Nguyễn Văn Phúc", "Đỗ Văn Nam"].sort(),
      classes: ["FLY-2026A", "KET-2025B"],
      courses: ALL_COURSES,
      enrollments: ["HS001@KET-2025B", "HS002@FLY-2026A", "HS005@FLY-2026A"],
      profiles: 1,
    })
  })

  it("assistant teacher gets the same class-scoped access", async () => {
    const seen = await visibleTo("tuan")
    expect(seen.students).toEqual(["HS002", "HS005"])
    expect(seen.classes).toEqual(["FLY-2026A"])
  })

  it("deactivated account sees nothing but its own profile", async () => {
    expect(await visibleTo("vinh")).toEqual({
      students: [],
      teachers: [],
      parents: [],
      classes: [],
      courses: [],
      enrollments: [],
      profiles: 1,
    })
  })

  it("parent sees only their own children and their classes/teachers", async () => {
    expect(await visibleTo("lan")).toEqual({
      students: ["HS001", "HS002"],
      teachers: ["GV001", "GV002", "GV003"],
      parents: ["Bùi Thị Lan"],
      classes: ["FLY-2026A", "KET-2025B", "TOAN6-2026A"],
      courses: ALL_COURSES,
      enrollments: ["HS001@KET-2025B", "HS001@TOAN6-2026A", "HS002@FLY-2026A"],
      profiles: 1,
    })
    const other = await visibleTo("duc")
    expect(other.students).toEqual(["HS003"])
    expect(other.classes).toEqual(["TOAN6-2026A"])
  })

  it("student sees only themselves, their classes and their teachers", async () => {
    expect(await visibleTo("huy")).toEqual({
      students: ["HS001"],
      teachers: ["GV001", "GV002"],
      parents: [],
      classes: ["KET-2025B", "TOAN6-2026A"],
      courses: ALL_COURSES,
      enrollments: ["HS001@KET-2025B", "HS001@TOAN6-2026A"],
      profiles: 1,
    })
  })

  it("withdrawn student keeps their enrolment record but loses the class", async () => {
    const seen = await visibleTo("khang")
    expect(seen.students).toEqual(["HS004"])
    expect(seen.classes).toEqual([])
    expect(seen.teachers).toEqual([])
    expect(seen.enrollments).toEqual(["HS004@FLY-2026A"])
  })

  it("student <-> parent links follow both ends' visibility", async () => {
    const count = (who: Who) =>
      as(db, ids[who], async (tx) => (await tx.query("select 1 from public.student_parents")).rows.length)
    expect(await count("admin")).toBe(6)
    expect(await count("hung")).toBe(3)
    expect(await count("lan")).toBe(2) // not her co-parent's links
    expect(await count("huy")).toBe(0) // students cannot read parents
  })
})

describe("writes", () => {
  const newStudent = "insert into public.students (student_code, full_name) values ('HS900', 'Học sinh Thử') returning id"

  it("admin can create students", async () => {
    const { rows } = await as(db, ids.admin, (tx) => tx.query(newStudent))
    expect(rows).toHaveLength(1)
  })

  it.each(["hung", "lan", "huy"] as const)("%s cannot create students", async (who) => {
    await expect(as(db, ids[who], (tx) => tx.query(newStudent))).rejects.toThrow(/row-level security/)
  })

  it("teacher cannot edit a student they teach", async () => {
    const { rows } = await as(db, ids.hung, (tx) =>
      tx.query("update public.students set notes = 'x' where student_code = 'HS001' returning id")
    )
    expect(rows).toHaveLength(0)
  })

  it("student cannot edit their own student record", async () => {
    const { rows } = await as(db, ids.huy, (tx) =>
      tx.query("update public.students set full_name = 'Hacker' where student_code = 'HS001' returning id")
    )
    expect(rows).toHaveLength(0)
  })

  it("parent cannot enrol a child", async () => {
    await expect(
      as(db, ids.lan, (tx) =>
        tx.query(`insert into public.enrollments (student_id, class_id)
          select s.id, c.id from public.students s, public.classes c
          where s.student_code = 'HS002' and c.code = 'TOAN6-2026A'`)
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("admin cannot hard-delete; super admin can", async () => {
    const adminDeleted = await as(db, ids.admin, async (tx) => {
      await tx.query(newStudent)
      return (await tx.query("delete from public.students where student_code = 'HS900' returning id")).rows
    })
    expect(adminDeleted).toHaveLength(0)

    const superDeleted = await as(db, ids.superAdmin, async (tx) => {
      await tx.query(newStudent)
      return (await tx.query("delete from public.students where student_code = 'HS900' returning id")).rows
    })
    expect(superDeleted).toHaveLength(1)
  })

  it("archiving a class immediately revokes teacher access to it", async () => {
    const after = await as(db, ids.admin, async (tx) => {
      await tx.query("update public.classes set deleted_at = now() where code = 'TOAN6-2026A'")
      await switchUser(tx, ids.hung)
      return {
        classes: await column(tx, "select code from public.classes"),
        students: await column(tx, "select student_code from public.students"),
      }
    })
    expect(after).toEqual({ classes: [], students: [] })
  })

  it("only super admin may change the permission matrix", async () => {
    const grant =
      "insert into public.role_permissions (role_code, permission_code, scope) values ('teacher', 'students.write', 'all')"
    await expect(as(db, ids.admin, (tx) => tx.query(grant))).rejects.toThrow(/row-level security/)
    await expect(as(db, ids.superAdmin, (tx) => tx.query(grant))).resolves.toBeDefined()
  })
})

describe("profiles and privilege escalation", () => {
  it("users can edit their own personal fields", async () => {
    const { rows } = await as(db, ids.hung, (tx) =>
      tx.query("update public.profiles set full_name = 'Lê Văn Hùng', phone = '0900000999' where id = $1 returning id", [
        ids.hung,
      ])
    )
    expect(rows).toHaveLength(1)
  })

  it.each(["role_code = 'super_admin'", "is_active = true", "email = 'x@bsmart.test'"])(
    "users cannot set %s on their own profile",
    async (assignment) => {
      await expect(
        as(db, ids.huy, (tx) => tx.query(`update public.profiles set ${assignment} where id = $1`, [ids.huy]))
      ).rejects.toThrow(/permission denied/)
    }
  )

  it("users cannot clear their own required password change", async () => {
    await expect(
      as(db, ids.huy, (tx) =>
        tx.query("update public.profiles set must_change_password = false where id = $1", [ids.huy])
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("new accounts flagged in app metadata must change password, and a password change clears it", async () => {
    const flag = async (tx: Session, email: string) =>
      (
        await tx.query<{ must_change_password: boolean }>(
          "select must_change_password from public.profiles where email = $1",
          [email]
        )
      ).rows[0]?.must_change_password

    const seen: Record<string, boolean | undefined> = {}
    await db
      .transaction(async (tx) => {
        await tx.query(
          `insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
           values (gen_random_uuid(), 'new.student@bsmart.test', 'hash-1',
                   '{"role": "student", "must_change_password": true}', '{"full_name": "Học sinh mới"}')`
        )
        seen.created = await flag(tx, "new.student@bsmart.test")

        await tx.query("update auth.users set last_sign_in_at = now() where email = 'new.student@bsmart.test'")
        seen.signedIn = await flag(tx, "new.student@bsmart.test")

        await tx.query("update auth.users set encrypted_password = 'hash-2' where email = 'new.student@bsmart.test'")
        seen.changed = await flag(tx, "new.student@bsmart.test")

        seen.unflagged = await flag(tx, EMAILS.huy)
        await tx.rollback()
      })
      .catch(() => {
        // rollback() rejects the transaction promise by design.
      })
    expect(seen).toEqual({ created: true, signedIn: true, changed: false, unflagged: false })
  })

  it("users cannot edit someone else's profile", async () => {
    const { rows } = await as(db, ids.huy, (tx) =>
      tx.query("update public.profiles set full_name = 'x' where id = $1 returning id", [ids.chau])
    )
    expect(rows).toHaveLength(0)
  })

  it("users cannot insert or delete profiles", async () => {
    await expect(
      as(db, ids.admin, (tx) => tx.query("delete from public.profiles where id = $1", [ids.huy]))
    ).rejects.toThrow(/permission denied/)
  })
})

describe("user management RPCs", () => {
  const setRole = (actor: Who, target: Who, role: string) =>
    as(db, ids[actor], async (tx) => {
      await tx.query("select public.set_user_role($1, $2)", [ids[target], role])
      return (await tx.query<{ role_code: string }>("select role_code from public.profiles where id = $1", [ids[target]]))
        .rows[0]?.role_code
    })

  it("admin can change roles of lower-ranked users", async () => {
    expect(await setRole("admin", "tuan", "student")).toBe("student")
  })

  it("admin cannot grant admin or super_admin", async () => {
    await expect(setRole("admin", "tuan", "admin")).rejects.toThrow(/lower role/)
    await expect(setRole("admin", "tuan", "super_admin")).rejects.toThrow(/lower role/)
  })

  it("admin cannot modify a super admin", async () => {
    await expect(setRole("admin", "superAdmin", "student")).rejects.toThrow(/lower role/)
  })

  it("nobody can change their own role", async () => {
    await expect(setRole("admin", "admin", "super_admin")).rejects.toThrow(/own account/)
    await expect(setRole("superAdmin", "superAdmin", "student")).rejects.toThrow(/own account/)
  })

  it("teachers, parents and students cannot manage users", async () => {
    for (const actor of ["hung", "lan", "huy"] as const) {
      await expect(setRole(actor, "chau", "admin")).rejects.toThrow(/permission to manage users/)
    }
  })

  it("super admin can assign any role", async () => {
    expect(await setRole("superAdmin", "admin", "teacher")).toBe("teacher")
    expect(await setRole("superAdmin", "hung", "super_admin")).toBe("super_admin")
  })

  it("rejects unknown roles", async () => {
    await expect(setRole("superAdmin", "hung", "principal")).rejects.toThrow(/Unknown role/)
  })

  it("deactivating a user revokes all of their access", async () => {
    const seen = await as(db, ids.admin, async (tx) => {
      await tx.query("select public.set_user_active($1, false)", [ids.huy])
      await switchUser(tx, ids.huy)
      return {
        students: await column(tx, "select student_code from public.students"),
        permissions: (await tx.query("select * from public.my_permissions()")).rows.length,
      }
    })
    expect(seen).toEqual({ students: [], permissions: 0 })
  })
})

describe("data integrity", () => {
  it("enforces class capacity", async () => {
    await expect(
      as(db, ids.admin, async (tx) => {
        await tx.query("update public.classes set capacity = 2 where code = 'FLY-2026A'")
        await tx.query(`insert into public.enrollments (student_id, class_id, status)
          select s.id, c.id, 'active' from public.students s, public.classes c
          where s.student_code = 'HS003' and c.code = 'FLY-2026A'`)
      })
    ).rejects.toThrow(/class is full/)
  })

  it("keeps a course's level inside its subject", async () => {
    await expect(
      as(db, ids.admin, (tx) =>
        tx.query(`insert into public.courses (code, name, subject_id, level_id)
          select 'BAD-1', 'Mismatched', s.id, l.id
          from public.subjects s, public.levels l
          where s.code = 'TOAN' and l.code = 'KET'`)
      )
    ).rejects.toThrow(/foreign key/)
  })

  it("rejects duplicate codes and a second lead teacher", async () => {
    await expect(
      as(db, ids.admin, (tx) =>
        tx.query("insert into public.students (student_code, full_name) values ('HS001', 'Trùng mã')")
      )
    ).rejects.toThrow(/duplicate key/)
    await expect(
      as(db, ids.admin, (tx) =>
        tx.query(`insert into public.class_members (class_id, teacher_id, member_role)
          select c.id, t.id, 'lead_teacher' from public.classes c, public.teachers t
          where c.code = 'FLY-2026A' and t.teacher_code = 'GV001'`)
      )
    ).rejects.toThrow(/duplicate key/)
  })
})

describe("avatar storage", () => {
  const upload = (actor: Who, folderOwner: Who) =>
    as(db, ids[actor], (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ids[folderOwner]}/avatar`])
    )

  it("users can upload into their own folder only", async () => {
    await expect(upload("huy", "huy")).resolves.toBeDefined()
    await expect(upload("huy", "chau")).rejects.toThrow(/row-level security/)
  })

  it("admins can read any avatar; other users cannot", async () => {
    const read = await as(db, ids.huy, async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ids.huy}/avatar`])
      const own = (await tx.query("select 1 from storage.objects")).rows.length
      await switchUser(tx, ids.chau)
      const other = (await tx.query("select 1 from storage.objects")).rows.length
      await switchUser(tx, ids.admin)
      const admin = (await tx.query("select 1 from storage.objects")).rows.length
      return { own, other, admin }
    })
    expect(read).toEqual({ own: 1, other: 0, admin: 1 })
  })
})
