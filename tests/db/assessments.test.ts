import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán: Huy (HS001), Châu (HS003)
  ha: "gv.ha@bsmart.test", // Flyers lead: HS002, HS005 (+ HS004 withdrawn)
  tuan: "gv.tuan@bsmart.test", // Flyers assistant
  vinh: "gv.vinh@bsmart.test",
  lan: "ph.lan@bsmart.test", // HS001 + HS002
  duc: "ph.duc@bsmart.test", // HS003
  huy: "hs.huy@bsmart.test",
  chau: "hs.chau@bsmart.test",
  khang: "hs.khang@bsmart.test",
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const studentIds: Record<string, string> = {}
const classIds: Record<string, string> = {}
const rubrics: Record<string, { id: string; scoring: string; criteria: unknown }> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows)
    studentIds[r.student_code] = r.id
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; name: string; scoring: string; criteria: unknown }>(
    "select id, name, scoring, criteria from public.assessment_rubrics"
  )).rows)
    rubrics[r.name] = r
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const count = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], async (tx) => (await tx.query(sql, params)).rows.length)
const codeOf = (id: string) => Object.entries(studentIds).find(([, v]) => v === id)?.[0]

async function asOwner(tx: Session, sql: string, params: unknown[] = []) {
  await tx.exec("reset role")
  try {
    return await tx.query(sql, params)
  } finally {
    await tx.exec("set local role authenticated")
  }
}

/** A published Toán task set by Hùng in the transaction. */
async function newTask(tx: Session, fields: Record<string, unknown> = {}, rubric = "General writing") {
  const r = rubrics[rubric]
  const values = {
    kind: "writing",
    title: "Viết đoạn văn",
    task: "Write about your school.",
    response_mode: "online_text",
    rubric_id: r.id,
    scoring: r.scoring,
    criteria: JSON.stringify(r.criteria),
    max_score: 0,
    status: "published",
    ...fields,
  }
  const keys = Object.keys(values)
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.assessment_tasks (class_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [classIds["TOAN6-2026A"], ...Object.values(values)]
  )
  return rows[0].id
}

const submit = async (tx: Session, taskId: string, text: string | null, file: object | null = null) =>
  (await tx.query<{ id: string }>("select public.submit_assessment($1, $2, $3) as id", [taskId, text, file ? JSON.stringify(file) : null])).rows[0].id
const grade = (tx: Session, submissionId: string, scores: number[], publish = false) =>
  tx.query<{ total: string }>("select public.grade_assessment($1, $2, 'Feedback', $3) as total", [submissionId, JSON.stringify(scores), publish])

// ---------------------------------------------------------------------------

describe("who sees what", () => {
  it.each([
    ["admin", 3],
    ["ha", 3],
    ["tuan", 3],
    ["hung", 0],
    ["lan", 2], // published only
    ["duc", 0],
    ["huy", 0],
    ["khang", 0],
    ["vinh", 0],
  ] as const)("%s sees %i tasks", async (who, n) => {
    expect(await count(who, "select 1 from public.assessment_tasks")).toBe(n)
  })

  it.each([
    ["admin", ["HS002", "HS005"]],
    ["ha", ["HS002", "HS005"]],
    ["tuan", ["HS002", "HS005"]],
    ["hung", []],
    ["lan", ["HS002"]],
    ["duc", []],
    ["vinh", []],
  ] as const)("%s sees submissions of %o", async (who, expected) => {
    const seen = await as(db, ids[who], async (tx) => (await column(tx, "select student_id from public.assessment_submissions")).map((v) => codeOf(String(v))))
    expect(seen.sort()).toEqual([...expected])
  })

  it("the parent sees the returned grade and every comment on it", async () => {
    expect(await count("lan", "select 1 from public.assessment_grades")).toBe(1)
    expect(await count("lan", "select 1 from public.assessment_annotations")).toBe(5)
    const quotes = await as(db, ids.lan, (tx) => column(tx, "select quote from public.assessment_annotations where anchor = 'text' order by start_offset"))
    expect(quotes).toEqual(["go", "like", "they was", "we eat"])
  })

  it("rubric templates and reusable comments are for staff only", async () => {
    expect(await count("hung", "select 1 from public.assessment_rubrics")).toBe(3)
    expect(await count("huy", "select 1 from public.assessment_rubrics")).toBe(0)
    expect(await count("ha", "select 1 from public.feedback_comments")).toBe(13)
    expect(await count("lan", "select 1 from public.feedback_comments")).toBe(0)
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["assessment_tasks", "assessment_submissions", "assessment_grades", "assessment_annotations", "feedback_comments"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })
})

describe("handing in", () => {
  it("online text: words are counted; one attempt unless the teacher allows another", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx)
      await switchUser(tx, ids.huy)
      const first = await submit(tx, task, "  My school is big and green.  ")
      const row = (await tx.query<{ word_count: number; attempt: number; text_response: string }>(
        "select word_count, attempt, text_response from public.assessment_submissions where id = $1",
        [first]
      )).rows[0]
      await tx.exec("savepoint again")
      await expect(submit(tx, task, "second")).rejects.toThrow(/Ask your teacher/)
      await tx.exec("rollback to savepoint again")
      await switchUser(tx, ids.hung)
      await tx.query("select public.set_assessment_resubmission($1, true)", [first])
      await switchUser(tx, ids.huy)
      const second = await submit(tx, task, "My school is big, green and friendly.")
      const attempts = await column(tx, "select attempt from public.assessment_submissions where task_id = $1 order by attempt", [task])
      await tx.exec("savepoint third")
      await expect(submit(tx, task, "third")).rejects.toThrow(/Ask your teacher/)
      await tx.exec("rollback to savepoint third")
      const events = await column(tx, "select event from public.assessment_events where submission_id = $1", [first])
      return { row, second: Boolean(second), attempts, events: events.sort() }
    })
    expect(result.row).toEqual({ word_count: 6, attempt: 1, text_response: "My school is big and green." })
    expect(result.attempts.map(Number)).toEqual([1, 2])
    expect(result.events).toEqual(["resubmission_allowed", "submitted"])
  })

  it("more attempts when the task allows them", async () => {
    const attempts = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx, { max_attempts: 2 })
      await switchUser(tx, ids.huy)
      await submit(tx, task, "one")
      await submit(tx, task, "two")
      return column(tx, "select attempt from public.assessment_submissions where task_id = $1 order by attempt", [task])
    })
    expect(attempts.map(Number)).toEqual([1, 2])
  })

  it("late work is flagged, or refused when not accepted; closed and draft tasks take nothing", async () => {
    const late = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx, { due_at: "2020-01-01T00:00:00Z" })
      await switchUser(tx, ids.huy)
      const id = await submit(tx, task, "late")
      return (await tx.query<{ is_late: boolean }>("select is_late from public.assessment_submissions where id = $1", [id])).rows[0].is_late
    })
    expect(late).toBe(true)
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, { due_at: "2020-01-01T00:00:00Z", allow_late: false })
        await switchUser(tx, ids.huy)
        await submit(tx, task, "late")
      })
    ).rejects.toThrow(/late work is not accepted/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, { closed_at: new Date().toISOString() })
        await switchUser(tx, ids.huy)
        await submit(tx, task, "x")
      })
    ).rejects.toThrow(/closed/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, { status: "draft" })
        await switchUser(tx, ids.huy)
        await submit(tx, task, "x")
      })
    ).rejects.toThrow(/not found/)
  })

  it("the answer must fit the task: text, a document, or a recording", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx)
        await switchUser(tx, ids.huy)
        await submit(tx, task, "   ")
      })
    ).rejects.toThrow(/Write your answer/)

    const doc = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx, { response_mode: "document" })
      await switchUser(tx, ids.huy)
      const path = `assessments/${studentIds.HS001}/${crypto.randomUUID()}.pdf`
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [
        path,
        JSON.stringify({ size: 3000, mimetype: "application/pdf" }),
      ])
      const id = await submit(tx, task, null, { path, name: "bai-viet.pdf", mime: "application/pdf", size: 3000 })
      return (await tx.query<{ file_name: string; word_count: number | null }>("select file_name, word_count from public.assessment_submissions where id = $1", [id])).rows[0]
    })
    expect(doc).toEqual({ file_name: "bai-viet.pdf", word_count: null })

    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, { kind: "speaking", response_mode: "audio" }, "Speaking")
        await switchUser(tx, ids.huy)
        const path = `assessments/${studentIds.HS001}/${crypto.randomUUID()}.pdf`
        await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [
          path,
          JSON.stringify({ size: 3000, mimetype: "application/pdf" }),
        ])
        await submit(tx, task, null, { path, name: "x.pdf", mime: "application/pdf", size: 3000 })
      })
    ).rejects.toThrow(/not accepted for this task/)
  })

  it("files only from the student's own folder", async () => {
    await expect(
      as(db, ids.chau, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [
          `assessments/${studentIds.HS001}/${crypto.randomUUID()}.m4a`,
        ])
      )
    ).rejects.toThrow(/row-level security/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, { kind: "speaking", response_mode: "audio" }, "Speaking")
        await switchUser(tx, ids.chau)
        await submit(tx, task, null, { path: `assessments/${studentIds.HS001}/x.m4a`, name: "x.m4a", mime: "audio/mp4", size: 10 })
      })
    ).rejects.toThrow(/wrong place/)
  })

  it.each(["lan", "hung", "admin"] as const)("%s cannot hand in work", async (who) => {
    const task = (await db.query<{ id: string }>("select id from public.assessment_tasks where status = 'published' limit 1")).rows[0].id
    await expect(run(who, "select public.submit_assessment($1, 'x')", [task])).rejects.toThrow(/Only students/)
  })

  it("students cannot write submissions, grades or events directly", async () => {
    await expect(run("huy", "update public.assessment_submissions set status = 'returned'")).rejects.toThrow(/permission denied/)
    await expect(run("huy", "insert into public.assessment_grades (submission_id, criterion_scores, total_score, graded_by, graded_by_name) select id, '[]', 20, $1, 'x' from public.assessment_submissions", [ids.huy])).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("grading", () => {
  const seededLinh = async () =>
    (await db.query<{ id: string }>(
      "select s.id from public.assessment_submissions s join public.students st on st.id = s.student_id where st.student_code = 'HS005'"
    )).rows[0].id

  it("points add up; each within its range in half-point steps", async () => {
    const linh = await seededLinh()
    const total = await as(db, ids.ha, async (tx) => (await grade(tx, linh, [4.5, 4, 3, 5])).rows[0].total)
    expect(total).toBe("16.5")
    await expect(as(db, ids.ha, (tx) => grade(tx, linh, [6, 4, 3, 5]))).rejects.toThrow(/within its range/)
    await expect(as(db, ids.ha, (tx) => grade(tx, linh, [4.25, 4, 3, 5]))).rejects.toThrow(/within its range/)
    await expect(as(db, ids.ha, (tx) => grade(tx, linh, [4, 4]))).rejects.toThrow(/Score every criterion/)
  })

  it.each([
    [[6, 7, 6, 7], "6.5"],
    [[6, 6, 6, 7], "6.5"], // 6.25 rounds up to 6.5
    [[7, 7, 7, 6], "7"], // 6.75 rounds up to 7
    [[6, 6, 6, 6], "6"],
    [[5, 6, 6, 6], "6"], // 5.75 -> 6
    [[5, 5, 6, 6], "5.5"],
  ])("IELTS-style bands %o average to %s", async (scores, band) => {
    const total = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx, {}, "IELTS-style Writing (bands 0–9)")
      await switchUser(tx, ids.huy)
      const id = await submit(tx, task, "An essay.")
      await switchUser(tx, ids.hung)
      return (await grade(tx, id, scores)).rows[0].total
    })
    expect(Number(total)).toBe(Number(band))
  })

  it("IELTS-style criteria take whole bands", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx, {}, "IELTS-style Writing (bands 0–9)")
        await switchUser(tx, ids.huy)
        const id = await submit(tx, task, "An essay.")
        await switchUser(tx, ids.hung)
        await grade(tx, id, [6.5, 6, 6, 6])
      })
    ).rejects.toThrow(/whole bands/)
  })

  it("the grade and comments stay hidden until returned", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx)
      await switchUser(tx, ids.huy)
      const id = await submit(tx, task, "My school are big.")
      await switchUser(tx, ids.hung)
      await tx.query(
        "insert into public.assessment_annotations (submission_id, anchor, start_offset, end_offset, category, comment, suggestion) values ($1, 'text', 10, 13, 'grammar', 'Agreement', 'is')",
        [id]
      )
      await grade(tx, id, [4, 4, 4, 3])
      const snapshot = async (who: Who) => {
        await switchUser(tx, ids[who])
        const r = {
          grades: (await tx.query("select 1 from public.assessment_grades where submission_id = $1", [id])).rows.length,
          notes: (await tx.query("select 1 from public.assessment_annotations where submission_id = $1", [id])).rows.length,
          status: (await tx.query<{ status: string }>("select status from public.assessment_submissions where id = $1", [id])).rows[0]?.status,
        }
        await switchUser(tx, ids.hung)
        return r
      }
      const before = { huy: await snapshot("huy"), lan: await snapshot("lan") }
      const returned = (await tx.query<{ n: number }>("select public.return_assessment_grades($1) as n", [task])).rows[0].n
      const after = { huy: await snapshot("huy"), lan: await snapshot("lan") }
      return { before, returned, after }
    })
    expect(seen.before).toEqual({ huy: { grades: 0, notes: 0, status: "graded" }, lan: { grades: 0, notes: 0, status: "graded" } })
    expect(seen.returned).toBe(1)
    expect(seen.after).toEqual({ huy: { grades: 1, notes: 1, status: "returned" }, lan: { grades: 1, notes: 1, status: "returned" } })
  })

  it.each([
    ["hung", /students you teach/],
    ["huy", /students you teach/],
    ["lan", /students you teach/],
  ] as const)("%s cannot grade Flyers work", async (who, error) => {
    const linh = await seededLinh()
    await expect(run(who, "select public.grade_assessment($1, '[1,1,1,1]')", [linh])).rejects.toThrow(error)
  })

  it("the assistant teacher of the class can grade", async () => {
    const linh = await seededLinh()
    const total = await as(db, ids.tuan, async (tx) => (await grade(tx, linh, [3, 3, 3, 3])).rows[0].total)
    expect(total).toBe("12")
  })
})

describe("annotations", () => {
  const anh = async () =>
    (await db.query<{ id: string }>(
      "select s.id from public.assessment_submissions s join public.students st on st.id = s.student_id where st.student_code = 'HS002'"
    )).rows[0].id

  it("the quote comes from the submitted text; highlights never overlap or leave the text", async () => {
    const id = await anh()
    const quote = await as(db, ids.ha, async (tx) =>
      (await tx.query<{ quote: string }>(
        "insert into public.assessment_annotations (submission_id, anchor, start_offset, end_offset, quote, comment) values ($1, 'text', 0, 6, 'forged', 'Greeting') returning quote",
        [id]
      )).rows[0].quote
    )
    expect(quote).toBe("Hi Sam")
    await expect(
      run("ha", "insert into public.assessment_annotations (submission_id, anchor, start_offset, end_offset, comment) values ($1, 'text', 0, 99999, 'x')", [id])
    ).rejects.toThrow(/not part of the answer/)
    await expect(
      as(db, ids.ha, async (tx) => {
        const existing = (await tx.query<{ start_offset: number }>("select start_offset from public.assessment_annotations where submission_id = $1 and anchor = 'text' limit 1", [id])).rows[0]
        await tx.query(
          "insert into public.assessment_annotations (submission_id, anchor, start_offset, end_offset, comment) values ($1, 'text', $2, $3, 'overlap')",
          [id, existing.start_offset, existing.start_offset + 1]
        )
      })
    ).rejects.toThrow(/already highlighted/)
  })

  it("comments are always a person's: a forged AI source is overwritten", async () => {
    const id = await anh()
    const row = await as(db, ids.ha, async (tx) =>
      (await tx.query<{ source: string; created_by: string }>(
        "insert into public.assessment_annotations (submission_id, anchor, comment, source) values ($1, 'general', 'Nice', 'ai_assisted') returning source, created_by",
        [id]
      )).rows[0]
    )
    expect(row).toEqual({ source: "teacher", created_by: ids.ha })
  })

  it("only the class's teachers annotate; edits keep the highlighted text", async () => {
    const id = await anh()
    for (const who of ["hung", "huy", "lan"] as const) {
      await expect(run(who, "insert into public.assessment_annotations (submission_id, anchor, comment) values ($1, 'general', 'x')", [id])).rejects.toThrow(
        /row-level security/
      )
    }
    const kept = await as(db, ids.ha, async (tx) =>
      (await tx.query<{ quote: string; comment: string }>(
        "update public.assessment_annotations set start_offset = 0, end_offset = 2, comment = 'Past tense, please.' where submission_id = $1 and quote = 'go' returning quote, comment",
        [id]
      )).rows[0]
    )
    expect(kept).toEqual({ quote: "go", comment: "Past tense, please." })
  })

  it("time-stamped comments need a time; empty comments are refused", async () => {
    const id = await anh()
    await expect(run("ha", "insert into public.assessment_annotations (submission_id, anchor, comment) values ($1, 'time', 'x')", [id])).rejects.toThrow(/check constraint/)
    await expect(run("ha", "insert into public.assessment_annotations (submission_id, anchor, comment) values ($1, 'general', '  ')", [id])).rejects.toThrow(/check constraint/)
  })
})

describe("rubrics, tasks and reusable comments", () => {
  it("built-in rubrics are read-only; teachers create their own; IELTS-style criteria are out of 9", async () => {
    expect(await count("admin", "update public.assessment_rubrics set name = 'x' where is_system returning id")).toBe(0)
    const own = await as(db, ids.hung, async (tx) =>
      (await tx.query<{ is_system: boolean; created_by: string }>(
        "insert into public.assessment_rubrics (name, kind, criteria, is_system) values ('Mine', 'writing', '[{\"name\":\"Ideas\",\"max_points\":10}]', true) returning is_system, created_by"
      )).rows[0]
    )
    expect(own).toEqual({ is_system: false, created_by: ids.hung })
    await expect(
      run("hung", "insert into public.assessment_rubrics (name, kind, scoring, criteria) values ('Bad', 'writing', 'ielts_band', '[{\"name\":\"TR\",\"max_points\":10}]')")
    ).rejects.toThrow(/9 for IELTS/)
    await expect(
      run("hung", "insert into public.assessment_rubrics (name, kind, criteria) values ('Dup', 'writing', '[{\"name\":\"A\",\"max_points\":5},{\"name\":\"a\",\"max_points\":5}]')")
    ).rejects.toThrow(/must be different/)
  })

  it("the task's rubric freezes once work is handed in; published tasks never return to draft", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx)
        await switchUser(tx, ids.huy)
        await submit(tx, task, "x")
        await switchUser(tx, ids.hung)
        await tx.query("update public.assessment_tasks set criteria = '[{\"name\":\"All\",\"max_points\":10}]' where id = $1", [task])
      })
    ).rejects.toThrow(/rubric cannot change/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const task = await newTask(tx)
        await tx.query("update public.assessment_tasks set status = 'draft' where id = $1", [task])
      })
    ).rejects.toThrow(/cannot go back to draft/)
    await expect(
      run("hung", "insert into public.assessment_tasks (class_id, kind, title, task, response_mode, criteria, max_score) values ($1, 'writing', 'x', 'y', 'online_text', '[{\"name\":\"A\",\"max_points\":5}]', 0)", [classIds["FLY-2026A"]])
    ).rejects.toThrow(/row-level security/)
    const max = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx)
      return (await tx.query<{ max_score: string }>("select max_score from public.assessment_tasks where id = $1", [task])).rows[0].max_score
    })
    expect(max).toBe("20.00")
  })

  it("reusable comments: shared for everyone who grades, private ones for their author", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      await tx.query("insert into public.feedback_comments (category, body) values ('grammar', 'My private note')")
      await switchUser(tx, ids.ha)
      const ha = (await tx.query("select 1 from public.feedback_comments where body = 'My private note'")).rows.length
      const edited = (await tx.query("update public.feedback_comments set body = 'x' where shared returning id")).rows.length
      return { ha, edited }
    })
    expect(seen).toEqual({ ha: 0, edited: 0 })
  })

  it("a teacher of one class cannot open the student's files handed in to another class", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      // Huy also belongs to Hà's KET class: reopen it for this test.
      await asOwner(tx, "update public.classes set status = 'active', end_date = null where code = 'KET-2025B'")
      const upload = async (task: string, ext: string) => {
        const path = `assessments/${studentIds.HS001}/${crypto.randomUUID()}.${ext}`
        await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [
          path,
          JSON.stringify({ size: 4000, mimetype: "audio/mp4" }),
        ])
        await submit(tx, task, null, { path, name: `x.${ext}`, mime: "audio/mp4", size: 4000 })
        return path
      }
      const toanTask = await newTask(tx, { kind: "speaking", response_mode: "audio" }, "Speaking")
      await switchUser(tx, ids.ha)
      const ketTask = (await tx.query<{ id: string }>(
        `insert into public.assessment_tasks (class_id, kind, title, task, response_mode, scoring, criteria, max_score, status)
         values ($1, 'speaking', 'KET speaking', 'Talk.', 'audio', 'points', '[{"name":"All","max_points":10}]', 0, 'published') returning id`,
        [classIds["KET-2025B"]]
      )).rows[0].id
      await switchUser(tx, ids.huy)
      const toanFile = await upload(toanTask, "m4a")
      const ketFile = await upload(ketTask, "m4a")
      await switchUser(tx, ids.ha)
      const ha = {
        ket: (await tx.query("select 1 from storage.objects where name = $1", [ketFile])).rows.length,
        toan: (await tx.query("select 1 from storage.objects where name = $1", [toanFile])).rows.length,
      }
      return ha
    })
    expect(seen).toEqual({ ket: 1, toan: 0 })
  })

  it("recordings and documents: the student, their parents and the task's teachers (per file)", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      const task = await newTask(tx, { kind: "speaking", response_mode: "audio" }, "Speaking")
      await switchUser(tx, ids.huy)
      const path = `assessments/${studentIds.HS001}/${crypto.randomUUID()}.m4a`
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [
        path,
        JSON.stringify({ size: 4000, mimetype: "audio/mp4" }),
      ])
      await submit(tx, task, null, { path, name: "me.m4a", mime: "audio/mp4", size: 4000 })
      const result: Record<string, number> = {}
      for (const who of ["hung", "lan", "duc", "ha", "chau"] as const) {
        await switchUser(tx, ids[who])
        result[who] = (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      }
      void asOwner
      return result
    })
    // Hà teaches Huy in another class, but not this task's class.
    expect(seen).toEqual({ hung: 1, lan: 1, duc: 0, ha: 0, chau: 0 })
  })
})
