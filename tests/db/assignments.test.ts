import { beforeAll, describe, expect, it } from "vitest"

import { UPLOAD_RULES } from "@/lib/uploads"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // TOAN6-2026A
  ha: "gv.ha@bsmart.test", // FLY-2026A (lead)
  tuan: "gv.tuan@bsmart.test", // FLY-2026A (assistant)
  vinh: "gv.vinh@bsmart.test", // deactivated
  lan: "ph.lan@bsmart.test", // HS001 (Toán) + HS002 (Flyers)
  duc: "ph.duc@bsmart.test", // HS003 (Toán)
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // HS004, withdrew from Flyers
} as const
type Who = keyof typeof EMAILS

const HOMEWORK = "Bài tập Phân số – tuần 3"
const QUIZ = "Kiểm tra 15 phút: Số nguyên tố"
const VOCAB = "Flyers Vocabulary – Animals"
const DRAFT = "Writing: My weekend"
const SCHEDULED = "Speaking: Describe a picture"

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const assignmentIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; title: string }>("select id, title from public.assignments")).rows)
    assignmentIds[r.title] = r.id
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const titles = (who: Who, relation = "assignments") =>
  as(db, ids[who], async (tx) => {
    const { rows } = await tx.query<{ title: string }>(
      relation === "assignments"
        ? "select title from public.assignments order by title"
        : `select distinct a.title from public.${relation} x join public.assignments a on a.id = x.assignment_id order by a.title`
    )
    return rows.map((r) => r.title)
  })

/** Runs SQL as the database owner inside the current test transaction (e.g. to move time-dependent values). */
async function asOwner(tx: Session, sql: string, params: unknown[] = []) {
  await tx.exec("reset role")
  try {
    return await tx.query(sql, params)
  } finally {
    await tx.exec("set local role authenticated")
  }
}

/** A published Toán assignment created by Hùng inside the transaction. */
async function publishedToan(tx: Session, fields: Record<string, unknown> = {}) {
  const values = {
    title: "Test assignment",
    assignment_type: "homework",
    instructions: "Làm bài và nộp.",
    due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...fields,
  }
  const keys = Object.keys(values)
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.assignments (class_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [classIds["TOAN6-2026A"], ...Object.values(values)]
  )
  await tx.query("update public.assignments set status = 'published' where id = $1", [rows[0].id])
  return rows[0].id
}

const start = async (tx: Session, assignmentId: string) =>
  (await tx.query<{ id: string }>("select public.start_submission($1) as id", [assignmentId])).rows[0].id
const submit = (tx: Session, submissionId: string) => tx.query("select public.submit_submission($1)", [submissionId])
const saveText = (tx: Session, submissionId: string, text: string) =>
  tx.query("update public.submissions set response_text = $2 where id = $1 returning id", [submissionId, text])

describe("who can see assignments", () => {
  it.each([
    ["admin", [DRAFT, VOCAB, HOMEWORK, QUIZ, SCHEDULED]],
    ["hung", [HOMEWORK, QUIZ]],
    // Editors see drafts and scheduled work.
    ["ha", [DRAFT, VOCAB, SCHEDULED]],
    ["tuan", [DRAFT, VOCAB, SCHEDULED]],
    ["vinh", []],
    // Students and parents: released work of their (children's) classes only.
    ["huy", [HOMEWORK, QUIZ]],
    ["chau", [HOMEWORK, QUIZ]],
    ["khang", []],
    ["lan", [VOCAB, HOMEWORK, QUIZ]],
    ["duc", [HOMEWORK, QUIZ]],
  ] as const)("%s", async (who, expected) => {
    expect(await titles(who)).toEqual([...expected].sort())
  })

  it("a scheduled assignment appears once its publication time has passed", async () => {
    const seen = await as(db, ids.lan, async (tx) => {
      const before = (await tx.query("select 1 from public.assignments where title = $1", [SCHEDULED])).rows.length
      await asOwner(tx, "alter table public.assignments disable trigger assignments_prepare")
      await asOwner(tx, "update public.assignments set publish_at = now() - interval '1 minute' where title = $1", [SCHEDULED])
      await asOwner(tx, "alter table public.assignments enable trigger assignments_prepare")
      const after = (await tx.query("select 1 from public.assignments where title = $1", [SCHEDULED])).rows.length
      return { before, after }
    })
    expect(seen).toEqual({ before: 0, after: 1 })
  })

  it("answer keys are visible to the assignment's editors only", async () => {
    const count = (who: Who) =>
      as(db, ids[who], async (tx) => (await tx.query("select 1 from public.assignment_answer_keys")).rows.length)
    expect(await count("admin")).toBe(6)
    expect(await count("hung")).toBe(5)
    expect(await count("ha")).toBe(1)
    for (const who of ["huy", "chau", "lan", "duc", "vinh"] as const) expect(await count(who)).toBe(0)
  })

  it("questions follow the assignment's visibility", async () => {
    expect(await titles("huy", "assignment_questions")).toEqual([HOMEWORK, QUIZ])
    expect(await titles("lan", "assignment_questions")).toEqual([VOCAB, HOMEWORK, QUIZ].sort())
    expect(await titles("khang", "assignment_questions")).toEqual([])
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["assignments", "submissions", "submission_grades", "assignment_answer_keys"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })
})

describe("who can see submissions and grades", () => {
  const submitters = (who: Who, relation: "submissions" | "submission_grades") =>
    as(db, ids[who], async (tx) => {
      const sql =
        relation === "submissions"
          ? "select distinct st.student_code from public.submissions s join public.students st on st.id = s.student_id"
          : "select distinct st.student_code from public.submission_grades g join public.submissions s on s.id = g.submission_id join public.students st on st.id = s.student_id"
      return (await column(tx, sql)).sort()
    })

  it.each([
    ["admin", ["HS001", "HS003"], ["HS001", "HS003"]],
    ["hung", ["HS001", "HS003"], ["HS001", "HS003"]],
    ["ha", [], []],
    ["huy", ["HS001"], ["HS001"]],
    // Châu's grade exists but has not been returned yet.
    ["chau", ["HS003"], []],
    ["lan", ["HS001"], ["HS001"]],
    ["duc", ["HS003"], []],
    ["vinh", [], []],
  ] as const)("%s", async (who, subs, grades) => {
    expect(await submitters(who, "submissions")).toEqual([...subs])
    expect(await submitters(who, "submission_grades")).toEqual([...grades])
  })

  it("seeded statuses: on time and returned, late and graded, in progress", async () => {
    const { rows } = await run(
      "admin",
      `select st.student_code, a.title, s.status, s.is_late from public.submissions s
       join public.students st on st.id = s.student_id join public.assignments a on a.id = s.assignment_id
       order by a.title, st.student_code`
    )
    expect(rows).toEqual([
      { student_code: "HS001", title: HOMEWORK, status: "returned", is_late: false },
      { student_code: "HS003", title: HOMEWORK, status: "graded", is_late: true },
      { student_code: "HS001", title: QUIZ, status: "in_progress", is_late: false },
    ])
  })
})

describe("teacher: assignment lifecycle", () => {
  it("draft -> published -> closed -> published -> archived -> closed", async () => {
    const states = await as(db, ids.hung, async (tx) => {
      const { rows } = await tx.query<{ id: string; status: string }>(
        "insert into public.assignments (class_id, title, assignment_type, instructions) values ($1, 'Ôn tập', 'worksheet', 'Làm phiếu.') returning id, status",
        [classIds["TOAN6-2026A"]]
      )
      const id = rows[0].id
      const seenBy = async (who: Who) => {
        await switchUser(tx, ids[who])
        const n = (await tx.query("select 1 from public.assignments where id = $1", [id])).rows.length
        await switchUser(tx, ids.hung)
        return n
      }
      const move = async (status: string) =>
        (await tx.query<{ status: string; published_at: string | null }>(
          "update public.assignments set status = $2 where id = $1 returning status, published_at",
          [id, status]
        )).rows[0]
      const trail: unknown[] = [rows[0].status, await seenBy("huy")]
      const published = await move("published")
      trail.push(published.status, Boolean(published.published_at), await seenBy("huy"))
      trail.push((await move("closed")).status, await seenBy("huy"))
      trail.push((await move("published")).status)
      trail.push((await move("archived")).status, await seenBy("huy"))
      trail.push((await move("closed")).status)
      return trail
    })
    expect(states).toEqual(["draft", 0, "published", true, 1, "closed", 1, "published", "archived", 0, "closed"])
  })

  it.each([
    ["published", "draft"],
    ["closed", "scheduled"],
  ])("rejects %s -> %s", async (from, to) => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await publishedToan(tx)
        if (from === "closed") await tx.query("update public.assignments set status = 'closed' where id = $1", [id])
        await tx.query("update public.assignments set status = $2 where id = $1", [id, to])
      })
    ).rejects.toThrow(/cannot go from/)
  })

  it("publishing needs instructions, a future schedule and a due date after release", async () => {
    await expect(
      as(db, ids.hung, (tx) =>
        tx.query(
          "insert into public.assignments (class_id, title, assignment_type, status) values ($1, 'x', 'quiz', 'published')",
          [classIds["TOAN6-2026A"]]
        )
      )
    ).rejects.toThrow(/Add instructions/)
    await expect(
      as(db, ids.hung, (tx) =>
        tx.query(
          "insert into public.assignments (class_id, title, assignment_type, instructions, status, publish_at) values ($1, 'x', 'quiz', 'y', 'scheduled', now() - interval '1 hour')",
          [classIds["TOAN6-2026A"]]
        )
      )
    ).rejects.toThrow(/in the future/)
    await expect(as(db, ids.hung, (tx) => publishedToan(tx, { due_at: "2020-01-01T00:00:00Z" }))).rejects.toThrow(
      /due date must be after/
    )
  })

  it("teachers work only in their own classes; students cannot create assignments", async () => {
    await expect(
      run("hung", "insert into public.assignments (class_id, title, assignment_type) values ($1, 'x', 'quiz')", [classIds["FLY-2026A"]])
    ).rejects.toThrow(/row-level security/)
    await expect(
      run("huy", "insert into public.assignments (class_id, title, assignment_type) values ($1, 'x', 'quiz')", [classIds["TOAN6-2026A"]])
    ).rejects.toThrow(/row-level security/)
    const updated = await as(db, ids.hung, async (tx) =>
      (await tx.query("update public.assignments set title = 'hack' where class_id = $1 returning id", [classIds["FLY-2026A"]])).rows.length
    )
    expect(updated).toBe(0)
  })

  it("finished classes take no new assignments", async () => {
    await expect(
      run("admin", "insert into public.assignments (class_id, title, assignment_type) values ($1, 'x', 'quiz')", [classIds["KET-2025B"]])
    ).rejects.toThrow(/planned or running classes/)
  })

  it("questions freeze once a student has started; only unpublished drafts can be deleted", async () => {
    await expect(
      run("hung", "update public.assignment_questions set prompt = 'changed' where assignment_id = $1", [assignmentIds[HOMEWORK]])
    ).rejects.toThrow(/once students have started/)
    const deleted = await as(db, ids.hung, async (tx) =>
      (await tx.query("delete from public.assignments where id = $1 returning id", [assignmentIds[HOMEWORK]])).rows.length
    )
    expect(deleted).toBe(0)
    const draftDeleted = await as(db, ids.ha, async (tx) =>
      (await tx.query("delete from public.assignments where id = $1 returning id", [assignmentIds[DRAFT]])).rows.length
    )
    expect(draftDeleted).toBe(1)
  })

  it("answer keys must match their question", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await publishedToan(tx)
        const q = (await tx.query<{ id: string }>(
          "insert into public.assignment_questions (assignment_id, position, kind, prompt, options) values ($1, 1, 'multiple_choice', 'Chọn', '{a,b}') returning id",
          [id]
        )).rows[0].id
        await tx.query("insert into public.assignment_answer_keys (question_id, correct_option) values ($1, 5)", [q])
      })
    ).rejects.toThrow(/one of the question's options/)
  })
})

describe("student: complete and submit", () => {
  it("start -> save -> submit -> locked -> confirmation in the history", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx)
      await switchUser(tx, ids.huy)
      const id = await start(tx, assignment)
      const again = await start(tx, assignment) // continuing returns the same attempt
      await saveText(tx, id, "Bài làm của em")
      const submittedAt = (await tx.query<{ t: string }>("select public.submit_submission($1) as t", [id])).rows[0].t
      const row = (await tx.query<{ status: string; is_late: boolean; attempt: number }>(
        "select status, is_late, attempt from public.submissions where id = $1",
        [id]
      )).rows[0]
      const events = await column(tx, "select event from public.submission_events where submission_id = $1 order by created_at, event", [id])
      return { same: id === again, submittedAt, row, events }
    })
    expect(result.same).toBe(true)
    expect(result.submittedAt).toBeTruthy()
    expect(result.row).toEqual({ status: "submitted", is_late: false, attempt: 1 })
    expect(result.events.sort()).toEqual(["started", "submitted"])
  })

  it("a submitted attempt cannot be edited, re-submitted or restarted", async () => {
    await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx)
      await switchUser(tx, ids.huy)
      const id = await start(tx, assignment)
      await saveText(tx, id, "v1")
      await submit(tx, id)
      // RLS hides the row from updates once it is no longer in progress.
      expect((await saveText(tx, id, "v2")).rows).toHaveLength(0)
      await expect(start(tx, assignment)).rejects.toThrow(/already submitted/)
    })
    await expect(
      as(db, ids.huy, async (tx) => {
        const id = (await tx.query<{ id: string }>(
          "select s.id from public.submissions s join public.assignments a on a.id = s.assignment_id where a.title = $1",
          [HOMEWORK]
        )).rows[0].id
        await submit(tx, id)
      })
    ).rejects.toThrow(/already been submitted/)
  })

  it("students cannot set their own status, lateness or grade", async () => {
    await expect(run("huy", "update public.submissions set status = 'submitted', is_late = false")).rejects.toThrow(/permission denied/)
    await expect(
      run("huy", "insert into public.submission_grades (submission_id, score) select id, 10 from public.submissions")
    ).rejects.toThrow(/permission denied/)
    await expect(
      run("huy", "insert into public.submissions (assignment_id, student_id) select id, id from public.assignments limit 1")
    ).rejects.toThrow(/permission denied/)
  })

  it("the teacher allows a resubmission: a second attempt starts from the first", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx)
      await switchUser(tx, ids.huy)
      const first = await start(tx, assignment)
      await saveText(tx, first, "attempt one")
      await submit(tx, first)
      await switchUser(tx, ids.hung)
      await tx.query("select public.set_resubmission($1, true)", [first])
      await switchUser(tx, ids.huy)
      const second = await start(tx, assignment)
      const copied = (await tx.query<{ attempt: number; response_text: string }>(
        "select attempt, response_text from public.submissions where id = $1",
        [second]
      )).rows[0]
      await saveText(tx, second, "attempt two")
      await submit(tx, second)
      const history = (await tx.query<{ attempt: number; status: string; response_text: string }>(
        "select attempt, status, response_text from public.submissions where assignment_id = $1 order by attempt",
        [assignment]
      )).rows
      await expect(start(tx, assignment)).rejects.toThrow(/already submitted/)
      return { copied, history }
    })
    expect(result.copied).toEqual({ attempt: 2, response_text: "attempt one" })
    expect(result.history).toEqual([
      { attempt: 1, status: "submitted", response_text: "attempt one" },
      { attempt: 2, status: "submitted", response_text: "attempt two" },
    ])
  })

  it("empty work, missing required files and unknown questions are refused", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx)
        await switchUser(tx, ids.huy)
        await submit(tx, await start(tx, assignment))
      })
    ).rejects.toThrow(/Add an answer or a file/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx, { requires_file: true })
        await switchUser(tx, ids.huy)
        const id = await start(tx, assignment)
        await saveText(tx, id, "text only")
        await submit(tx, id)
      })
    ).rejects.toThrow(/needs at least one file/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx)
        await switchUser(tx, ids.huy)
        const id = await start(tx, assignment)
        await tx.query("update public.submissions set answers = $2 where id = $1", [
          id,
          JSON.stringify({ "00000000-0000-4000-8000-000000000000": { text: "x" } }),
        ])
      })
    ).rejects.toThrow(/unknown question/)
  })

  it("late work is flagged, or refused when late work is not accepted", async () => {
    const late = await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx)
      await tx.query("update public.assignments set due_at = now() - interval '1 hour' where id = $1", [assignment])
      await switchUser(tx, ids.huy)
      const id = await start(tx, assignment)
      await saveText(tx, id, "muộn")
      await submit(tx, id)
      return (await tx.query<{ is_late: boolean }>("select is_late from public.submissions where id = $1", [id])).rows[0].is_late
    })
    expect(late).toBe(true)

    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx, { allow_late: false })
        await tx.query("update public.assignments set due_at = now() - interval '1 hour' where id = $1", [assignment])
        await switchUser(tx, ids.huy)
        await start(tx, assignment)
      })
    ).rejects.toThrow(/due date has passed/)
  })

  it("closed and archived assignments take no work", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx)
        await tx.query("update public.assignments set status = 'closed' where id = $1", [assignment])
        await switchUser(tx, ids.huy)
        await start(tx, assignment)
      })
    ).rejects.toThrow(/closed/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const assignment = await publishedToan(tx)
        await switchUser(tx, ids.huy)
        const id = await start(tx, assignment)
        await saveText(tx, id, "x")
        await switchUser(tx, ids.hung)
        await tx.query("update public.assignments set status = 'closed' where id = $1", [assignment])
        await switchUser(tx, ids.huy)
        await submit(tx, id)
      })
    ).rejects.toThrow(/closed/)
  })

  it("a timed attempt cannot be changed after its time is up, but can still be handed in", async () => {
    const status = await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx, { time_limit_minutes: 15, assignment_type: "quiz" })
      await switchUser(tx, ids.huy)
      const id = await start(tx, assignment)
      await saveText(tx, id, "đang làm")
      await asOwner(tx, "update public.submissions set deadline_at = now() - interval '5 minutes' where id = $1", [id])
      await expect(saveText(tx, id, "thêm")).rejects.toThrow(/Time is up/)
      return id
    })
    expect(status).toBeTruthy()
    const submitted = await as(db, ids.hung, async (tx) => {
      const assignment = await publishedToan(tx, { time_limit_minutes: 15, assignment_type: "quiz" })
      await switchUser(tx, ids.huy)
      const id = await start(tx, assignment)
      await saveText(tx, id, "đang làm")
      await asOwner(tx, "update public.submissions set deadline_at = now() - interval '5 minutes' where id = $1", [id])
      await submit(tx, id)
      return (await tx.query<{ status: string }>("select status from public.submissions where id = $1", [id])).rows[0].status
    })
    expect(submitted).toBe("submitted")
  })

  it.each(["lan", "hung", "admin"] as const)("%s cannot submit work", async (who) => {
    await expect(run(who, "select public.start_submission($1)", [assignmentIds[QUIZ]])).rejects.toThrow(/Only students/)
  })

  it("students cannot start work for classes they are not in, or touch someone else's attempt", async () => {
    await expect(run("khang", "select public.start_submission($1)", [assignmentIds[VOCAB]])).rejects.toThrow(/not found/)
    const touched = await as(db, ids.chau, async (tx) =>
      (await tx.query(
        "update public.submissions set response_text = 'x' where assignment_id = $1 returning id",
        [assignmentIds[QUIZ]]
      )).rows.length
    )
    expect(touched).toBe(0)
  })
})

describe("teacher: grading and returning", () => {
  const huyHomework = async (tx: Session) =>
    (await tx.query<{ id: string }>(
      `select s.id from public.submissions s join public.students st on st.id = s.student_id
       where s.assignment_id = $1 and st.student_code = 'HS001'`,
      [assignmentIds[HOMEWORK]]
    )).rows[0].id
  const chauHomework = async (tx: Session) =>
    (await tx.query<{ id: string }>(
      `select s.id from public.submissions s join public.students st on st.id = s.student_id
       where s.assignment_id = $1 and st.student_code = 'HS003'`,
      [assignmentIds[HOMEWORK]]
    )).rows[0].id

  it("grade (hidden) -> return (visible to the student and parent) -> history", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const id = await chauHomework(tx)
      await tx.query("select public.grade_submission($1, 7.5, 'Khá hơn rồi', false)", [id])
      await switchUser(tx, ids.chau)
      const hidden = (await tx.query("select 1 from public.submission_grades where submission_id = $1", [id])).rows.length
      await switchUser(tx, ids.hung)
      const returned = (await tx.query<{ n: number }>("select public.return_grades($1) as n", [assignmentIds[HOMEWORK]])).rows[0].n
      await switchUser(tx, ids.chau)
      const grade = (await tx.query<{ score: string; feedback: string }>(
        "select score, feedback from public.submission_grades where submission_id = $1",
        [id]
      )).rows[0]
      const status = (await tx.query<{ status: string }>("select status from public.submissions where id = $1", [id])).rows[0].status
      await switchUser(tx, ids.duc)
      const parentSees = (await tx.query("select 1 from public.submission_grades where submission_id = $1", [id])).rows.length
      const events = await column(tx, "select event from public.submission_events where submission_id = $1", [id])
      return { hidden, returned, grade, status, parentSees, events }
    })
    expect(result.hidden).toBe(0)
    expect(result.returned).toBe(1)
    expect(result.grade).toEqual({ score: "7.50", feedback: "Khá hơn rồi" })
    expect(result.status).toBe("returned")
    expect(result.parentSees).toBe(1)
    expect([...result.events].sort()).toEqual(["graded", "graded", "returned", "started", "submitted"])
  })

  it("the score in the history stays hidden until the grade is returned", async () => {
    const details = (who: Who) =>
      as(db, ids[who], async (tx) => {
        const id = await chauHomework(tx)
        return column(tx, "select coalesce(detail, event::text) from public.submission_events where submission_id = $1 and event = 'graded'", [id])
      })
    expect(await details("hung")).toEqual(["6 / 10"])
    expect(await details("chau")).toEqual([])
    expect(await details("duc")).toEqual([])
  })
  it("scores must be within 0..max, and only submitted work is graded", async () => {
    await expect(as(db, ids.hung, async (tx) => tx.query("select public.grade_submission($1, 11)", [await huyHomework(tx)]))).rejects.toThrow(
      /between 0 and 10/
    )
    await expect(
      as(db, ids.hung, async (tx) => {
        const inProgress = (await tx.query<{ id: string }>("select id from public.submissions where status = 'in_progress'")).rows[0].id
        await tx.query("select public.grade_submission($1, 5)", [inProgress])
      })
    ).rejects.toThrow(/not been submitted/)
  })

  it.each(["ha", "huy", "lan"] as const)("%s cannot grade Toán work", async (who) => {
    const submissionId = (await db.query<{ id: string }>("select id from public.submissions where status = 'graded'")).rows[0].id
    await expect(run(who, "select public.grade_submission($1, 5)", [submissionId])).rejects.toThrow(/classes you teach/)
    await expect(run(who, "select public.set_resubmission($1, true)", [submissionId])).rejects.toThrow(/classes you teach/)
  })

  it("the maximum score cannot drop below existing grades", async () => {
    await expect(run("hung", "update public.assignments set max_score = 5 where id = $1", [assignmentIds[HOMEWORK]])).rejects.toThrow(
      /higher than the new maximum/
    )
  })

  it("auto-marking suggests points for objective questions only", async () => {
    const marks = await as(db, ids.hung, async (tx) => {
      const huy = (await tx.query<{ correct: boolean | null }>("select correct from public.submission_auto_marks($1)", [await huyHomework(tx)])).rows
      const chau = (await tx.query<{ correct: boolean | null }>("select correct from public.submission_auto_marks($1)", [await chauHomework(tx)])).rows
      return { huy: huy.map((r) => r.correct), chau: chau.map((r) => r.correct) }
    })
    expect(marks).toEqual({ huy: [true, true, null], chau: [false, true, null] })
    await expect(
      as(db, ids.huy, async (tx) => tx.query("select * from public.submission_auto_marks($1)", [await huyHomework(tx)]))
    ).rejects.toThrow(/classes you teach/)
  })
})

describe("files", () => {
  const PDF = { size: 2048, mimetype: "application/pdf" }
  const upload = (tx: Session, path: string, metadata: object = PDF) =>
    tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify(metadata)])
  const record = (tx: Session, submissionId: string, path: string, name = "bai-lam.pdf", mime = "application/pdf", size = 2048) =>
    tx.query("insert into public.submission_files (submission_id, object_path, file_name, mime_type, size_bytes) values ($1, $2, $3, $4, $5)", [
      submissionId,
      path,
      name,
      mime,
      size,
    ])
  const uuid = () => crypto.randomUUID()

  /** Huy's open attempt on a fresh assignment. */
  const openAttempt = async (tx: Session) => {
    const assignment = await publishedToan(tx)
    await switchUser(tx, ids.huy)
    return start(tx, assignment)
  }

  it("a student uploads to their own open attempt; the teacher can read it, other students cannot", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      const id = await openAttempt(tx)
      const path = `submissions/${id}/${uuid()}.pdf`
      await upload(tx, path)
      await record(tx, id, path)
      await saveText(tx, id, "xem file")
      await submit(tx, id)
      const count = async (who: Who) => {
        await switchUser(tx, ids[who])
        return (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      }
      return { hung: await count("hung"), huy: await count("huy"), chau: await count("chau"), ha: await count("ha") }
    })
    expect(seen).toEqual({ hung: 1, huy: 1, chau: 0, ha: 0 })
  })

  it("storage refuses disallowed extensions and other people's folders", async () => {
    await expect(as(db, ids.hung, async (tx) => upload(tx, `submissions/${await openAttempt(tx)}/${uuid()}.exe`))).rejects.toThrow(
      /row-level security/
    )
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await openAttempt(tx)
        await switchUser(tx, ids.chau)
        await upload(tx, `submissions/${id}/${uuid()}.pdf`)
      })
    ).rejects.toThrow(/row-level security/)
  })

  it.each([
    ["type/extension mismatch", { name: "anh.pdf", mime: "image/png" }, /not allowed/],
    ["disallowed type", { name: "virus.exe", mime: "application/x-msdownload" }, /not allowed|foreign key/],
    ["size differs from the upload", { size: 999 }, /size does not match/],
    ["type differs from the upload", { name: "anh.png", mime: "image/png", ext: "png" }, /type does not match/],
    ["too large", { size: 30 * 1024 * 1024 }, /20 MB|check constraint/],
    ["file never uploaded", { skipUpload: true }, /not found/],
    ["wrong folder", { folder: "submissions/00000000-0000-4000-8000-000000000000" }, /wrong place/],
  ] as const)("the file record is refused: %s", async (_label, variant, error) => {
    const v = variant as { name?: string; mime?: string; size?: number; ext?: string; skipUpload?: boolean; folder?: string }
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await openAttempt(tx)
        const path = `submissions/${id}/${uuid()}.${v.ext ?? "pdf"}`
        if (!v.skipUpload) await upload(tx, path)
        const recorded = v.folder ? `${v.folder}/${uuid()}.pdf` : path
        await record(tx, id, recorded, v.name, v.mime, v.size)
      })
    ).rejects.toThrow(error)
  })

  it("at most 5 files per attempt", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await openAttempt(tx)
        for (let i = 0; i < 6; i++) {
          const path = `submissions/${id}/${uuid()}.pdf`
          await upload(tx, path)
          await record(tx, id, path)
        }
      })
    ).rejects.toThrow(/at most 5 files/)
  })

  it("files are frozen once the work is handed in", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await openAttempt(tx)
        const path = `submissions/${id}/${uuid()}.pdf`
        await upload(tx, path)
        await record(tx, id, path)
        await submit(tx, id)
        await upload(tx, `submissions/${id}/${uuid()}.pdf`)
      })
    ).rejects.toThrow(/row-level security/)
    const removed = await as(db, ids.hung, async (tx) => {
      const id = await openAttempt(tx)
      const path = `submissions/${id}/${uuid()}.pdf`
      await upload(tx, path)
      await record(tx, id, path)
      await submit(tx, id)
      return (await tx.query("delete from public.submission_files where submission_id = $1 returning id", [id])).rows.length
    })
    expect(removed).toBe(0)
  })

  it("teachers attach files to their own assignments only", async () => {
    const attached = await as(db, ids.hung, async (tx) => {
      const path = `assignments/${assignmentIds[HOMEWORK]}/${uuid()}.pdf`
      await upload(tx, path)
      await tx.query(
        "insert into public.assignment_attachments (assignment_id, object_path, file_name, mime_type, size_bytes) values ($1, $2, 'phieu.pdf', 'application/pdf', 2048)",
        [assignmentIds[HOMEWORK], path]
      )
      await switchUser(tx, ids.huy)
      return (await tx.query("select 1 from public.assignment_attachments where object_path = $1", [path])).rows.length
    })
    expect(attached).toBe(1)
    await expect(as(db, ids.hung, (tx) => upload(tx, `assignments/${assignmentIds[VOCAB]}/${uuid()}.pdf`))).rejects.toThrow(
      /row-level security/
    )
    await expect(as(db, ids.huy, (tx) => upload(tx, `assignments/${assignmentIds[HOMEWORK]}/${uuid()}.pdf`))).rejects.toThrow(
      /row-level security/
    )
  })

  it("the accepted file types match the app's upload rules and the bucket", async () => {
    const rows = (await db.query<{ mime_type: string; extensions: string[] }>(
      "select mime_type, extensions from public.upload_file_types order by mime_type"
    )).rows
    expect(rows.map((r) => [r.mime_type, [...r.extensions].sort()])).toEqual(
      Object.entries(UPLOAD_RULES.types)
        .map(([mime, t]) => [mime, [...t.extensions].sort()])
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
    )
    const bucket = (await db.query<{ file_size_limit: string; allowed_mime_types: string[] }>(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'assignment-files'"
    )).rows[0]
    expect(Number(bucket.file_size_limit)).toBe(UPLOAD_RULES.maxBytes)
    expect([...bucket.allowed_mime_types].sort()).toEqual(Object.keys(UPLOAD_RULES.types).sort())
  })
})
