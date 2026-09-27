import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // Toán (owns the Toán bank questions)
  ha: "gv.ha@bsmart.test", // Flyers (owns the English bank questions)
  vinh: "gv.vinh@bsmart.test", // deactivated
  lan: "ph.lan@bsmart.test", // HS001 (Toán) + HS002 (Flyers)
  duc: "ph.duc@bsmart.test", // HS003 (Toán)
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // HS004, no current class
} as const
type Who = keyof typeof EMAILS

const MATH = "Kiểm tra chương 1"
const FLY = "Flyers Unit 4 check"
const GRAMMAR = "Grammar quick test"

let db: TestDb
const ids = {} as Record<Who, string>
const classIds: Record<string, string> = {}
const testIds: Record<string, string> = {}
const subjectIds: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.classes")).rows) classIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; code: string }>("select id, code from public.subjects")).rows) subjectIds[r.code] = r.id
  for (const r of (await db.query<{ id: string; title: string }>("select id, title from public.tests")).rows) testIds[r.title] = r.id
})

const run = (who: Who, sql: string, params: unknown[] = []) => as(db, ids[who], (tx) => tx.query(sql, params))
const count = (who: Who, sql: string, params: unknown[] = []) =>
  as(db, ids[who], async (tx) => (await tx.query(sql, params)).rows.length)

async function asOwner(tx: Session, sql: string, params: unknown[] = []) {
  await tx.exec("reset role")
  try {
    return await tx.query(sql, params)
  } finally {
    await tx.exec("set local role authenticated")
  }
}

const bankQuestionId = async (tx: Session, prompt: string) =>
  (await tx.query<{ id: string }>("select id from public.bank_questions where prompt = $1", [prompt])).rows[0].id

const saveQuestion = (tx: Session, id: string | null, fields: object, answer: object, explanation: string | null = null) =>
  tx.query<{ id: string }>("select public.save_bank_question($1, $2, $3, $4) as id", [id, JSON.stringify(fields), JSON.stringify(answer), explanation])

/** A published Toán test built by Hùng from the given bank prompts (default: two objective questions). */
async function newMathTest(tx: Session, settings: Record<string, unknown> = {}, prompts = ["Số nào chia hết cho cả 2 và 3?", "Mọi số nguyên tố đều là số lẻ."]) {
  const values = { title: "Bài kiểm tra thử", max_attempts: 1, total_score: 10, ...settings }
  const keys = Object.keys(values)
  const id = (await tx.query<{ id: string }>(
    `insert into public.tests (class_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [classIds["TOAN6-2026A"], ...Object.values(values)]
  )).rows[0].id
  const questionIds = await Promise.all(prompts.map((p) => bankQuestionId(tx, p)))
  await tx.query("select public.add_test_questions($1, $2::uuid[])", [id, questionIds])
  await tx.query("update public.tests set status = 'published' where id = $1", [id])
  return id
}

const start = async (tx: Session, testId: string) => (await tx.query<{ id: string }>("select public.start_test($1) as id", [testId])).rows[0].id
const answer = (tx: Session, attemptId: string, questionId: string, response: object) =>
  tx.query(
    `insert into public.test_answers (attempt_id, test_question_id, response) values ($1, $2, $3)
     on conflict (attempt_id, test_question_id) do update set response = excluded.response`,
    [attemptId, questionId, JSON.stringify(response)]
  )
const questionsOf = async (tx: Session, testId: string) =>
  (await tx.query<{ id: string; question_type: string; prompt: string }>(
    "select id, question_type, prompt from public.test_questions where test_id = $1 order by position",
    [testId]
  )).rows

// ---------------------------------------------------------------------------

describe("question bank access", () => {
  it.each([
    // 14 from the tests seed + 2 reading questions from the English seed
    ["admin", 16],
    ["hung", 16],
    ["ha", 16],
    ["huy", 0],
    ["lan", 0],
    ["khang", 0],
    ["vinh", 0],
  ] as const)("%s sees %i bank questions and as many keys", async (who, expected) => {
    expect(await count(who, "select 1 from public.bank_questions")).toBe(expected)
    expect(await count(who, "select 1 from public.bank_question_keys")).toBe(expected)
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["bank_questions", "bank_question_keys", "tests", "test_questions", "test_question_keys", "test_attempts"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })
})

describe("question bank editing", () => {
  const essay = { subject_id: "", question_type: "essay", prompt: "Viết về gia đình em.", difficulty: "easy", points: 2 }

  it("teachers edit their own questions only; admins edit any", async () => {
    await as(db, ids.hung, async (tx) => {
      const id = await bankQuestionId(tx, "Tính: 3/5 + 1/5 = ?")
      await saveQuestion(tx, id, { subject_id: subjectIds.TOAN, question_type: "short_answer", prompt: "Tính: 2/5 + 1/5 = ?" }, { accepted: ["3/5"] })
    })
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await bankQuestionId(tx, "A person who flies a plane is a …")
        await saveQuestion(tx, id, { subject_id: subjectIds.ANH, question_type: "essay", prompt: "hijacked" }, {})
      })
    ).rejects.toThrow(/may not edit it/)
    await as(db, ids.admin, async (tx) => {
      const id = await bankQuestionId(tx, "A person who flies a plane is a …")
      await tx.query("update public.bank_questions set difficulty = 'hard' where id = $1", [id])
    })
  })

  it("students and parents cannot write to the bank", async () => {
    for (const who of ["huy", "lan"] as const) {
      await expect(
        as(db, ids[who], (tx) => saveQuestion(tx, null, { ...essay, subject_id: subjectIds.TOAN }, {}))
      ).rejects.toThrow(/permission to edit the question bank/)
    }
  })

  it("duplicating makes an owned copy with its key; the original is untouched", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const source = await bankQuestionId(tx, "A person who flies a plane is a …")
      const copy = (await tx.query<{ id: string }>("select public.duplicate_bank_question($1) as id", [source])).rows[0].id
      const row = (await tx.query<{ created_by: string; duplicated_from: string }>(
        "select created_by, duplicated_from from public.bank_questions where id = $1",
        [copy]
      )).rows[0]
      const key = (await tx.query<{ answer: unknown }>("select answer from public.bank_question_keys where question_id = $1", [copy])).rows[0]
      // Hùng may now edit the copy.
      await saveQuestion(tx, copy, { subject_id: subjectIds.ANH, question_type: "multiple_choice", prompt: "Copy", content: { options: ["a", "b"] } }, { correct: 1 })
      return { row, key, source }
    })
    expect(result.row).toEqual({ created_by: ids.hung, duplicated_from: result.source })
    expect(result.key.answer).toEqual({ correct: 0 })
  })

  it("editing content bumps the version; tags are normalised", async () => {
    const row = await as(db, ids.hung, async (tx) => {
      const id = (await saveQuestion(tx, null, { ...essay, subject_id: subjectIds.TOAN, tags: [" Gia-Dinh ", "gia-dinh", "", "Lop6"] }, {})).rows[0].id
      await saveQuestion(tx, id, { ...essay, subject_id: subjectIds.TOAN, prompt: "Viết về bạn thân.", tags: ["gia-dinh", "lop6"] }, {})
      return (await tx.query<{ version: number; tags: string[]; created_by: string }>(
        "select version, tags, created_by from public.bank_questions where id = $1",
        [id]
      )).rows[0]
    })
    expect(row).toEqual({ version: 2, tags: ["gia-dinh", "lop6"], created_by: ids.hung })
  })

  it.each([
    ["an out-of-range correct option", { question_type: "multiple_choice", prompt: "x", content: { options: ["a", "b"] } }, { correct: 5 }, /correct option/],
    ["a multiple choice without a key", { question_type: "multiple_choice", prompt: "x", content: { options: ["a", "b"] } }, {}, /correct option/],
    ["too few options", { question_type: "multiple_choice", prompt: "x", content: { options: ["a"] } }, { correct: 0 }, /2 and 8/],
    ["a fill-in without blanks", { question_type: "fill_blank", prompt: "No blank here" }, { blanks: [["a"]] }, /___/],
    ["a fill-in with a missing blank answer", { question_type: "fill_blank", prompt: "___ and ___" }, { blanks: [["a"]] }, /every blank/],
    ["matching with a repeated answer", { question_type: "matching", prompt: "m", content: { left: ["a", "b"], right: ["1", "2"] } }, { pairs: [0, 0] }, /exactly one/],
    ["true/false without a boolean", { question_type: "true_false", prompt: "t" }, { correct: "yes" }, /true or false/],
    ["a transformation without a sentence", { question_type: "sentence_transformation", prompt: "t" }, {}, /sentence the student/],
  ])("rejects %s", async (_label, fields, key, error) => {
    await expect(as(db, ids.hung, (tx) => saveQuestion(tx, null, { subject_id: subjectIds.TOAN, ...fields }, key))).rejects.toThrow(error)
  })

  it("archived questions cannot be edited or added to tests, and are never deleted", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await bankQuestionId(tx, "Tính: 3/5 + 1/5 = ?")
        await tx.query("update public.bank_questions set status = 'archived' where id = $1", [id])
        await tx.query("update public.bank_questions set topic = 'x' where id = $1", [id])
      })
    ).rejects.toThrow(/Restore the question/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = await bankQuestionId(tx, "Tính: 3/5 + 1/5 = ?")
        await tx.query("update public.bank_questions set status = 'archived' where id = $1", [id])
        await newMathTest(tx, {}, ["Tính: 3/5 + 1/5 = ?"])
      })
    ).rejects.toThrow(/Archived questions/)
    await expect(run("admin", "delete from public.bank_questions")).rejects.toThrow(/permission denied/)
  })

  it("tests keep their own copy: later bank edits change nothing in them", async () => {
    const prompts = await as(db, ids.hung, async (tx) => {
      const id = await bankQuestionId(tx, "Số nào chia hết cho cả 2 và 3?")
      await saveQuestion(
        tx,
        id,
        { subject_id: subjectIds.TOAN, question_type: "multiple_choice", prompt: "Changed", content: { options: ["x", "y"] } },
        { correct: 1 }
      )
      return column(tx, "select prompt from public.test_questions where source_question_id = $1", [id])
    })
    expect(prompts).toEqual(["Số nào chia hết cho cả 2 và 3?"])
  })
})

describe("who can see tests, questions and keys", () => {
  const titles = (who: Who) =>
    as(db, ids[who], async (tx) => (await column(tx, "select title from public.tests")).map(String).sort())

  it.each([
    ["admin", [FLY, GRAMMAR, MATH]],
    ["hung", [MATH]],
    ["ha", [FLY, GRAMMAR]],
    ["huy", [MATH]],
    ["chau", [MATH]],
    ["lan", [FLY, MATH]], // not the Flyers draft
    ["duc", [MATH]],
    ["khang", []],
    ["vinh", []],
  ] as const)("%s", async (who, expected) => {
    expect(await titles(who)).toEqual([...expected].sort())
  })

  it("students see a test's questions only after starting it", async () => {
    const seen = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx)
      await switchUser(tx, ids.huy)
      const before = (await tx.query("select 1 from public.test_questions where test_id = $1", [test])).rows.length
      await start(tx, test)
      const after = (await tx.query("select 1 from public.test_questions where test_id = $1", [test])).rows.length
      return { before, after }
    })
    expect(seen).toEqual({ before: 0, after: 2 })
    // Parents: only tests a child has started.
    expect(await count("lan", "select 1 from public.test_questions where test_id = $1", [testIds[FLY]])).toBe(0)
    expect(await count("lan", "select 1 from public.test_questions where test_id = $1", [testIds[MATH]])).toBe(6)
  })

  it("answer keys are never readable by students or parents", async () => {
    for (const who of ["huy", "chau", "lan", "duc", "khang"] as const) {
      expect(await count(who, "select 1 from public.test_question_keys")).toBe(0)
      expect(await count(who, "select 1 from public.bank_question_keys")).toBe(0)
    }
    expect(await count("hung", "select 1 from public.test_question_keys")).toBe(6)
    expect(await count("ha", "select 1 from public.test_question_keys")).toBe(9)
  })

  it("marks in test_answers are not readable through the API at all", async () => {
    for (const who of ["huy", "hung", "admin"] as const) {
      await expect(run(who, "select auto_score from public.test_answers")).rejects.toThrow(/permission denied/)
      await expect(run(who, "select manual_score, feedback from public.test_answers")).rejects.toThrow(/permission denied/)
    }
    // Their own responses are.
    expect(await count("huy", "select response from public.test_answers")).toBe(6)
    expect(await count("chau", "select response from public.test_answers")).toBe(6)
  })
})

describe("automatic grading", () => {
  const grade = (type: string, content: object, key: object, response: object | null, points = 2) =>
    db
      .query<{ score: string | null; needs_review: boolean }>(
        "select score, needs_review from private.grade_response($1::public.question_type, $2, $3, $4, $5)",
        [type, JSON.stringify(content), JSON.stringify(key), response === null ? null : JSON.stringify(response), points]
      )
      .then((r) => ({ score: r.rows[0].score === null ? null : Number(r.rows[0].score), review: r.rows[0].needs_review }))

  const options = { options: ["a", "b", "c", "d"] }

  it.each([
    ["multiple_choice right", "multiple_choice", options, { correct: 1 }, { choice: 1 }, 2, false],
    ["multiple_choice wrong", "multiple_choice", options, { correct: 1 }, { choice: 2 }, 0, false],
    ["true_false right", "true_false", {}, { correct: false }, { value: false }, 2, false],
    ["true_false wrong", "true_false", {}, { correct: false }, { value: true }, 0, false],
    ["multiple_response all right", "multiple_response", options, { correct: [0, 2] }, { choices: [2, 0] }, 2, false],
    ["multiple_response one right, one wrong", "multiple_response", options, { correct: [0, 2] }, { choices: [0, 3] }, 0, false],
    ["multiple_response half", "multiple_response", options, { correct: [0, 2] }, { choices: [0] }, 1, false],
    ["matching 2 of 3", "matching", { left: ["a", "b", "c"], right: ["1", "2", "3"] }, { pairs: [2, 0, 1] }, { pairs: [2, 1, 1] }, 1.33, false],
    ["fill_blank alternatives, case and spaces", "fill_blank", { blank_count: 2 }, { blanks: [["goes", "walks"], ["Hà Nội"]] }, { blanks: ["  WALKS ", "hà  nội."] }, 2, false],
    ["fill_blank case-sensitive", "fill_blank", { blank_count: 1 }, { blanks: [["Paris"]], case_sensitive: true }, { blanks: ["paris"] }, 0, false],
    ["short_answer listed", "short_answer", {}, { accepted: ["went"] }, { text: " Went. " }, 2, false],
    ["short_answer not listed -> teacher", "short_answer", {}, { accepted: ["went"] }, { text: "goed" }, null, true],
    ["essay -> teacher", "essay", {}, {}, { text: "My family..." }, null, true],
    ["listening with choices", "listening", { format: "choice", ...options }, { correct: 3 }, { choice: 3 }, 2, false],
    ["listening in writing -> teacher", "listening", { format: "text" }, {}, { text: "eggs" }, null, true],
    ["unanswered essay", "essay", {}, {}, { text: "  " }, 0, false],
    ["unanswered anything", "matching", { left: ["a", "b"], right: ["1", "2"] }, { pairs: [0, 1] }, null, 0, false],
  ] as const)("%s", async (_label, type, content, key, response, score, review) => {
    expect(await grade(type, content, key, response)).toEqual({ score, review })
  })

  it("seeded results: Huy fully graded, Châu waiting for the teacher", async () => {
    const { rows } = await run(
      "admin",
      `select st.student_code, a.status, a.raw_score, a.raw_max, a.score from public.test_attempts a
       join public.students st on st.id = a.student_id order by st.student_code`
    )
    expect(rows).toEqual([
      // 1 + 1 + 1 + 1 + essay 2 + multiple response (2 right, 1 wrong of 3) 0.67 = 6.67 of 8 -> 8.34 / 10
      { student_code: "HS001", status: "graded", raw_score: "6.67", raw_max: "8.00", score: "8.34" },
      // "4 / 5" is not a listed answer and the essay needs marking.
      { student_code: "HS003", status: "submitted", raw_score: "3.00", raw_max: "8.00", score: "3.75" },
    ])
  })
})

describe("taking a test", () => {
  it("each attempt gets its own order; answers go to the open attempt only", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx, { shuffle_questions: true, shuffle_options: true, max_attempts: 2 }, [
        "Số nào chia hết cho cả 2 và 3?",
        "Mọi số nguyên tố đều là số lẻ.",
        "Phân số 6/8 rút gọn thành ___.",
      ])
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      const row = (await tx.query<{ question_order: string[]; option_orders: Record<string, number[]> }>(
        "select question_order, option_orders from public.test_attempts where id = $1",
        [attempt]
      )).rows[0]
      const questions = await questionsOf(tx, test)
      for (const q of questions) {
        const response = q.question_type === "multiple_choice" ? { choice: 2 } : q.question_type === "true_false" ? { value: false } : { blanks: ["3/4"] }
        await answer(tx, attempt, q.id, response)
      }
      await tx.query("select public.submit_test_attempt($1)", [attempt])
      const done = (await tx.query<{ status: string; score: string }>("select status, score from public.test_attempts where id = $1", [attempt]))
        .rows[0]
      // Handed in: no more changes.
      await expect(answer(tx, attempt, questions[0].id, { choice: 0 })).rejects.toThrow(/row-level security|handed in/)
      return { row, questions, done }
    })
    expect([...result.row.question_order].sort()).toEqual(result.questions.map((q) => q.id).sort())
    const mcq = result.questions.find((q) => q.question_type === "multiple_choice")!
    expect([...result.row.option_orders[mcq.id]].sort()).toEqual([0, 1, 2, 3])
    expect(result.done).toEqual({ status: "graded", score: "10.00" })
  })

  it("the number of attempts is enforced", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx, { max_attempts: 1 })
        await switchUser(tx, ids.huy)
        await tx.query("select public.submit_test_attempt($1)", [await start(tx, test)])
        await start(tx, test)
      })
    ).rejects.toThrow(/used all 1 attempt/)
  })

  it("opening and closing times are enforced", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx, { available_from: new Date(Date.now() + 86_400_000).toISOString() })
        await switchUser(tx, ids.huy)
        await start(tx, test)
      })
    ).rejects.toThrow(/opens at/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx)
        await asOwner(tx, "update public.tests set available_until = now() - interval '1 minute' where id = $1", [test])
        await switchUser(tx, ids.huy)
        await start(tx, test)
      })
    ).rejects.toThrow(/has closed/)
  })

  it("after the time limit answers are refused; the attempt is handed in automatically", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx, { time_limit_minutes: 10, max_attempts: 2 })
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      const [q] = await questionsOf(tx, test)
      await answer(tx, attempt, q.id, { choice: 2 })
      await asOwner(tx, "update public.test_attempts set deadline_at = now() - interval '5 minutes' where id = $1", [attempt])
      // A failed statement aborts the transaction; the savepoint lets the test carry on.
      await tx.exec("savepoint late_answer")
      await expect(answer(tx, attempt, q.id, { choice: 1 })).rejects.toThrow(/row-level security|Time is up/)
      await tx.exec("rollback to savepoint late_answer")
      // Starting again hands the expired attempt in (with what was saved) and opens attempt 2.
      const second = await start(tx, test)
      const first = (await tx.query<{ status: string; auto_submitted: boolean; raw_score: string }>(
        "select status, auto_submitted, raw_score from public.test_attempts where id = $1",
        [attempt]
      )).rows[0]
      return { first, differs: second !== attempt }
    })
    expect(result).toEqual({ first: { status: "graded", auto_submitted: true, raw_score: "1.00" }, differs: true })
  })

  it("closing a test hands in every open attempt", async () => {
    const status = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx)
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      await switchUser(tx, ids.hung)
      await tx.query("update public.tests set status = 'closed' where id = $1", [test])
      await switchUser(tx, ids.huy)
      return (await tx.query<{ status: string }>("select status from public.test_attempts where id = $1", [attempt])).rows[0].status
    })
    expect(status).toBe("graded")
  })

  it("answers must fit the question and belong to the attempt", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx)
        await switchUser(tx, ids.huy)
        const attempt = await start(tx, test)
        const mcq = (await questionsOf(tx, test)).find((q) => q.question_type === "multiple_choice")!
        await answer(tx, attempt, mcq.id, { choice: 9 })
      })
    ).rejects.toThrow(/Choose one of the options/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx)
        await switchUser(tx, ids.huy)
        const attempt = await start(tx, test)
        const other = (await questionsOf(tx, testIds[MATH]))[0]
        await answer(tx, attempt, other.id, { choice: 0 })
      })
    ).rejects.toThrow(/not part of the attempt/)
  })

  it("students cannot write someone else's attempt, create attempts or set scores", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx)
        await switchUser(tx, ids.huy)
        const attempt = await start(tx, test)
        const [q] = await questionsOf(tx, test)
        await switchUser(tx, ids.chau)
        await answer(tx, attempt, q.id, { choice: 0 })
      })
    ).rejects.toThrow(/row-level security|violates/)
    await expect(run("huy", "update public.test_attempts set score = 10")).rejects.toThrow(/permission denied/)
    await expect(
      run("huy", "insert into public.test_attempts (test_id, student_id, attempt_number, question_order) select id, id, 9, '{}' from public.tests limit 1")
    ).rejects.toThrow(/permission denied/)
    await expect(run("huy", "update public.test_answers set auto_score = 99")).rejects.toThrow(/permission denied/)
  })

  it.each(["lan", "hung", "admin"] as const)("%s cannot take tests", async (who) => {
    await expect(run(who, "select public.start_test($1)", [testIds[MATH]])).rejects.toThrow(/Only students/)
  })

  it("students cannot start tests of other classes or drafts", async () => {
    await expect(run("huy", "select public.start_test($1)", [testIds[FLY]])).rejects.toThrow(/not found/)
    await expect(run("khang", "select public.start_test($1)", [testIds[GRAMMAR]])).rejects.toThrow(/not found/)
  })
})

describe("review policy (when students see marks and answers)", () => {
  const details = (tx: Session, attemptId: string) =>
    tx
      .query<{ auto_score: string | null; correct_answer: unknown; explanation: string | null; review_open: boolean; response: unknown }>(
        "select auto_score, correct_answer, explanation, review_open, response from public.attempt_details($1)",
        [attemptId]
      )
      .then((r) => r.rows)
  const seededAttempt = async (tx: Session, code: string) =>
    (await tx.query<{ id: string }>(
      "select a.id from public.test_attempts a join public.students s on s.id = a.student_id where s.student_code = $1 and a.test_id = $2",
      [code, testIds[MATH]]
    )).rows[0].id

  it("after the last attempt: hidden while Huy has an attempt left, shown once he has used them", async () => {
    const result = await as(db, ids.huy, async (tx) => {
      const attempt = await seededAttempt(tx, "HS001")
      const before = await details(tx, attempt)
      await tx.query("select public.submit_test_attempt($1)", [await start(tx, testIds[MATH])])
      const after = await details(tx, attempt)
      return { before, after }
    })
    expect(result.before.every((r) => r.auto_score === null && r.correct_answer === null && !r.review_open)).toBe(true)
    expect(result.before.some((r) => r.response !== null)).toBe(true) // their own answers are shown
    expect(result.after.every((r) => r.review_open)).toBe(true)
    expect(result.after.filter((r) => r.correct_answer !== null).length).toBeGreaterThan(0)
  })

  it("never: the key stays hidden even when all attempts are used and the test is closed", async () => {
    const rows = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx, { review_policy: "never" })
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      await tx.query("select public.submit_test_attempt($1)", [attempt])
      await switchUser(tx, ids.hung)
      await tx.query("update public.tests set status = 'closed' where id = $1", [test])
      await switchUser(tx, ids.huy)
      return details(tx, attempt)
    })
    expect(rows.every((r) => r.correct_answer === null && r.auto_score === null)).toBe(true)
  })

  it("after close: shown to students and parents only once the test is closed", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx, { review_policy: "after_close" })
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      await tx.query("select public.submit_test_attempt($1)", [attempt])
      const open = (await details(tx, attempt))[0].review_open
      await switchUser(tx, ids.hung)
      await tx.query("update public.tests set status = 'closed' where id = $1", [test])
      await switchUser(tx, ids.lan)
      const parent = (await details(tx, attempt))[0]
      return { open, parent }
    })
    expect(result.open).toBe(false)
    expect(result.parent.review_open).toBe(true)
    expect(result.parent.correct_answer).not.toBeNull()
  })

  it("teachers always see everything; other teachers and other families see nothing", async () => {
    const rows = await as(db, ids.hung, async (tx) => details(tx, await seededAttempt(tx, "HS003")))
    expect(rows.some((r) => r.correct_answer !== null)).toBe(true)
    for (const who of ["ha", "huy", "lan"] as const) {
      await expect(as(db, ids[who], async (tx) => details(tx, await seededAttempt(tx, "HS003")))).rejects.toThrow(/Attempt not found|Cannot read/)
    }
  })

  it("a student cannot see the answers of an attempt still in progress via the details function", async () => {
    const rows = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx)
      await switchUser(tx, ids.huy)
      return details(tx, await start(tx, test))
    })
    expect(rows.every((r) => r.correct_answer === null && r.auto_score === null)).toBe(true)
  })
})

describe("manual grading and analytics", () => {
  const chauAttempt = async (tx: Session) =>
    (await tx.query<{ id: string }>(
      "select a.id from public.test_attempts a join public.students s on s.id = a.student_id where s.student_code = 'HS003'"
    )).rows[0].id
  const mathQuestion = async (tx: Session, type: string) =>
    (await tx.query<{ id: string }>("select id from public.test_questions where test_id = $1 and question_type = $2", [testIds[MATH], type]))
      .rows[0].id

  it("marking the open questions completes the attempt and its score", async () => {
    const attempt = await as(db, ids.hung, async (tx) => {
      const id = await chauAttempt(tx)
      await tx.query("select public.grade_test_answer($1, $2, 1, 'Đúng, chỉ khác cách viết.')", [id, await mathQuestion(tx, "short_answer")])
      const halfway = (await tx.query<{ status: string }>("select status from public.test_attempts where id = $1", [id])).rows[0].status
      await tx.query("select public.grade_test_answer($1, $2, 1, 'Cần nêu định nghĩa số nguyên tố.')", [id, await mathQuestion(tx, "essay")])
      const done = (await tx.query<{ status: string; raw_score: string; score: string }>(
        "select status, raw_score, score from public.test_attempts where id = $1",
        [id]
      )).rows[0]
      return { halfway, done }
    })
    expect(attempt).toEqual({ halfway: "submitted", done: { status: "graded", raw_score: "5.00", score: "6.25" } })
  })

  it("teachers can override an automatic mark, within the question's points", async () => {
    await expect(
      as(db, ids.hung, async (tx) => tx.query("select public.grade_test_answer($1, $2, 5)", [await chauAttempt(tx), await mathQuestion(tx, "essay")]))
    ).rejects.toThrow(/between 0 and 2/)
    const score = await as(db, ids.hung, async (tx) => {
      const id = await chauAttempt(tx)
      await tx.query("select public.grade_test_answer($1, $2, 1)", [id, await mathQuestion(tx, "true_false")])
      return (await tx.query<{ raw_score: string }>("select raw_score from public.test_attempts where id = $1", [id])).rows[0].raw_score
    })
    expect(score).toBe("4.00")
  })

  it.each(["ha", "huy", "duc"] as const)("%s cannot grade Toán attempts", async (who) => {
    // Read outside the transaction: the in-process database has one connection.
    const attempt = (await db.query<{ id: string; q: string }>("select id, question_order[1] as q from public.test_attempts limit 1")).rows[0]
    await expect(run(who, "select public.grade_test_answer($1, $2, 1)", [attempt.id, attempt.q])).rejects.toThrow(/classes you teach/)
  })

  it("per-question analytics for the test's teachers only", async () => {
    const stats = await as(db, ids.hung, async (tx) =>
      (await tx.query<{ question_type: string; attempts: string; average_score: string; full_marks: string; awaiting_review: string }>(
        "select question_type, attempts, average_score, full_marks, awaiting_review from public.test_question_stats($1)",
        [testIds[MATH]]
      )).rows
    )
    expect(stats).toHaveLength(6)
    expect(stats.every((s) => Number(s.attempts) === 2)).toBe(true)
    expect(stats.find((s) => s.question_type === "multiple_choice")).toMatchObject({ full_marks: 1, average_score: "0.50" })
    expect(stats.find((s) => s.question_type === "essay")).toMatchObject({ awaiting_review: 1 })
    for (const who of ["ha", "huy", "lan"] as const) {
      await expect(run(who, "select * from public.test_question_stats($1)", [testIds[MATH]])).rejects.toThrow(/classes you teach/)
    }
  })

  it("close_expired_attempts hands in abandoned attempts for the teacher", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const test = await newMathTest(tx, { time_limit_minutes: 5 })
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      await asOwner(tx, "update public.test_attempts set deadline_at = now() - interval '10 minutes' where id = $1", [attempt])
      await switchUser(tx, ids.hung)
      const closed = (await tx.query<{ n: number }>("select public.close_expired_attempts($1) as n", [test])).rows[0].n
      const row = (await tx.query<{ status: string; auto_submitted: boolean }>(
        "select status, auto_submitted from public.test_attempts where id = $1",
        [attempt]
      )).rows[0]
      return { closed, row }
    })
    expect(result).toEqual({ closed: 1, row: { status: "graded", auto_submitted: true } })
  })
})

describe("test builder rules", () => {
  it("publishing needs questions; questions change only in drafts", async () => {
    await expect(
      as(db, ids.hung, async (tx) => {
        const id = (await tx.query<{ id: string }>(
          "insert into public.tests (class_id, title) values ($1, 'Trống') returning id",
          [classIds["TOAN6-2026A"]]
        )).rows[0].id
        await tx.query("update public.tests set status = 'published' where id = $1", [id])
      })
    ).rejects.toThrow(/at least one question/)
    await expect(run("hung", "delete from public.test_questions where test_id = $1", [testIds[MATH]])).rejects.toThrow(/while the test is a draft/)
    await expect(run("hung", "update public.test_question_keys set answer = '{}'")).rejects.toThrow(/while the test is a draft/)
  })

  it("scoring and randomisation freeze once students have started; attempts only go up", async () => {
    await expect(run("hung", "update public.tests set total_score = 100 where id = $1", [testIds[MATH]])).rejects.toThrow(/cannot change once/)
    await expect(run("hung", "update public.tests set max_attempts = 1 where id = $1", [testIds[MATH]])).rejects.toThrow(/only go up/)
    expect(await count("hung", "update public.tests set max_attempts = 3 where id = $1 returning id", [testIds[MATH]])).toBe(1)
  })

  it("teachers build tests only for their classes and from questions with keys", async () => {
    await expect(
      run("hung", "insert into public.tests (class_id, title) values ($1, 'x')", [classIds["FLY-2026A"]])
    ).rejects.toThrow(/row-level security/)
    await expect(run("hung", "select public.add_test_questions($1, '{}')", [testIds[GRAMMAR]])).rejects.toThrow(/classes you teach/)
    await expect(
      as(db, ids.hung, async (tx) => {
        const q = (await saveQuestion(tx, null, { subject_id: subjectIds.TOAN, question_type: "multiple_choice", prompt: "Chưa có đáp án", content: { options: ["a", "b"] } }, { correct: 0 })).rows[0].id
        // Remove the key behind the builder's back, then try to use it.
        await asOwner(tx, "delete from public.bank_question_keys where question_id = $1", [q])
        const test = (await tx.query<{ id: string }>("insert into public.tests (class_id, title) values ($1, 'x') returning id", [classIds["TOAN6-2026A"]])).rows[0].id
        await tx.query("select public.add_test_questions($1, $2::uuid[])", [test, [q]])
      })
    ).rejects.toThrow(/Add an answer key/)
  })

  it("the same bank question is added once; reordering swaps positions", async () => {
    const positions = await as(db, ids.hung, async (tx) => {
      const test = (await tx.query<{ id: string }>("insert into public.tests (class_id, title) values ($1, 'x') returning id", [classIds["TOAN6-2026A"]])).rows[0].id
      const a = await bankQuestionId(tx, "Số nào chia hết cho cả 2 và 3?")
      const b = await bankQuestionId(tx, "Mọi số nguyên tố đều là số lẻ.")
      await tx.query("select public.add_test_questions($1, $2::uuid[])", [test, [a, b, a]])
      const added = (await tx.query<{ n: number }>("select public.add_test_questions($1, $2::uuid[]) as n", [test, [a]])).rows[0].n
      const second = (await questionsOf(tx, test))[1].id
      await tx.query("select public.move_test_question($1, 'up')", [second])
      return { added, order: (await questionsOf(tx, test)).map((q) => q.prompt) }
    })
    expect(positions).toEqual({ added: 0, order: ["Mọi số nguyên tố đều là số lẻ.", "Số nào chia hết cho cả 2 và 3?"] })
  })
})

describe("spoken answers (files)", () => {
  it("a recording goes only into the student's own open attempt, and must be audio", async () => {
    const result = await as(db, ids.hung, async (tx) => {
      const speaking = (await saveQuestion(tx, null, { subject_id: subjectIds.TOAN, question_type: "speaking", prompt: "Nói về số yêu thích." }, {})).rows[0].id
      const test = (await tx.query<{ id: string }>("insert into public.tests (class_id, title) values ($1, 'Nói') returning id", [classIds["TOAN6-2026A"]])).rows[0].id
      await tx.query("select public.add_test_questions($1, $2::uuid[])", [test, [speaking]])
      await tx.query("update public.tests set status = 'published' where id = $1", [test])
      await switchUser(tx, ids.huy)
      const attempt = await start(tx, test)
      const [q] = await questionsOf(tx, test)
      const path = `test-attempts/${attempt}/${crypto.randomUUID()}.webm`
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [
        path,
        JSON.stringify({ size: 4096, mimetype: "audio/webm" }),
      ])
      await answer(tx, attempt, q.id, { file: { path, name: "ghi-am.webm", mime: "audio/webm", size: 4096 } })
      await tx.query("select public.submit_test_attempt($1)", [attempt])
      const status = (await tx.query<{ status: string }>("select status from public.test_attempts where id = $1", [attempt])).rows[0].status
      await switchUser(tx, ids.chau)
      const otherStudentSees = (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      await switchUser(tx, ids.hung)
      const teacherSees = (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      return { status, otherStudentSees, teacherSees }
    })
    expect(result).toEqual({ status: "submitted", otherStudentSees: 0, teacherSees: 1 })

    // No uploads once the attempt's time is up.
    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx, { time_limit_minutes: 5 })
        await switchUser(tx, ids.huy)
        const attempt = await start(tx, test)
        await asOwner(tx, "update public.test_attempts set deadline_at = now() - interval '5 minutes' where id = $1", [attempt])
        await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [
          `test-attempts/${attempt}/${crypto.randomUUID()}.webm`,
        ])
      })
    ).rejects.toThrow(/row-level security/)

    await expect(
      as(db, ids.hung, async (tx) => {
        const test = await newMathTest(tx)
        await switchUser(tx, ids.huy)
        const attempt = await start(tx, test)
        await switchUser(tx, ids.chau)
        await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [
          `test-attempts/${attempt}/${crypto.randomUUID()}.webm`,
        ])
      })
    ).rejects.toThrow(/row-level security/)
  })
})
