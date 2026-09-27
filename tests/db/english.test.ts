import { beforeAll, describe, expect, it } from "vitest"

import { as, column, createTestDb, switchUser, userId, type Session, type TestDb } from "./harness"

const EMAILS = {
  admin: "admin@bsmart.test",
  hung: "gv.hung@bsmart.test", // teaches Huy (HS001) and Châu (HS003) in Toán
  ha: "gv.ha@bsmart.test", // author of the English content; taught Huy in KET
  vinh: "gv.vinh@bsmart.test", // deactivated
  lan: "ph.lan@bsmart.test", // parent of HS001, HS002
  duc: "ph.duc@bsmart.test", // parent of HS003
  huy: "hs.huy@bsmart.test", // HS001
  chau: "hs.chau@bsmart.test", // HS003
  khang: "hs.khang@bsmart.test", // HS004
} as const
type Who = keyof typeof EMAILS

let db: TestDb
const ids = {} as Record<Who, string>
const studentIds: Record<string, string> = {}
const lessons: Record<string, string> = {}
const sets: Record<string, string> = {}

beforeAll(async () => {
  db = await createTestDb()
  for (const [who, email] of Object.entries(EMAILS)) ids[who as Who] = await userId(db, email)
  for (const r of (await db.query<{ id: string; student_code: string }>("select id, student_code from public.students")).rows)
    studentIds[r.student_code] = r.id
  for (const r of (await db.query<{ id: string; skill: string }>("select id, skill from public.lessons")).rows) lessons[r.skill] = r.id
  for (const r of (await db.query<{ id: string; title: string }>("select id, title from public.vocabulary_sets")).rows) sets[r.title] = r.id
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

const lessonQuestionIds = (tx: Session, lesson: string) =>
  tx.query<{ id: string; question_type: string }>("select id, question_type from public.lesson_questions where lesson_id = $1 order by position", [
    lessons[lesson],
  ]).then((r) => r.rows)

// ---------------------------------------------------------------------------

describe("content library", () => {
  it.each([
    ["admin", 14, 3, 6],
    ["ha", 14, 3, 6],
    ["hung", 14, 3, 6], // content editors see drafts too
    ["huy", 14, 2, 5],
    ["lan", 14, 2, 5],
    ["khang", 14, 2, 5],
    ["vinh", 0, 0, 0],
  ] as const)("%s sees %i words, %i sets, %i lessons", async (who, words, setCount, lessonCount) => {
    expect(await count(who, "select 1 from public.vocabulary_words")).toBe(words)
    expect(await count(who, "select 1 from public.vocabulary_sets")).toBe(setCount)
    expect(await count(who, "select 1 from public.lessons")).toBe(lessonCount)
  })

  it("anonymous users are refused outright", async () => {
    for (const relation of ["vocabulary_words", "lessons", "lesson_question_keys", "lesson_private", "lesson_attempts", "vocabulary_progress"]) {
      await expect(as(db, null, (tx) => tx.query(`select 1 from public.${relation}`))).rejects.toThrow(/permission denied/)
    }
  })

  it("teachers edit their own content only; admins edit any; students none", async () => {
    expect(await count("hung", "update public.lessons set title = 'x' where id = $1 returning id", [lessons.grammar])).toBe(0)
    expect(await count("hung", "update public.vocabulary_words set meaning_vi = 'x' returning id")).toBe(0)
    expect(await count("ha", "update public.lessons set summary = 'Updated' where id = $1 returning id", [lessons.grammar])).toBe(1)
    expect(await count("admin", "update public.lessons set summary = 'Updated' where id = $1 returning id", [lessons.grammar])).toBe(1)
    expect(await count("hung", "insert into public.vocabulary_words (word, part_of_speech, meaning_vi) values ('ant', 'noun', 'con kiến') returning id")).toBe(1)
    await expect(run("huy", "insert into public.vocabulary_words (word, part_of_speech, meaning_vi) values ('ant', 'noun', 'x')")).rejects.toThrow(
      /row-level security/
    )
    await expect(
      run("huy", "insert into public.lessons (skill, title, body) values ('grammar', 'x', 'y')")
    ).rejects.toThrow(/row-level security/)
    await expect(run("admin", "delete from public.vocabulary_words")).rejects.toThrow(/permission denied/)
  })

  it("publishing rules: 4 words per set, content for lessons, audio for listening", async () => {
    await expect(
      run("ha", "insert into public.vocabulary_sets (title, status) values ('Empty', 'published')")
    ).rejects.toThrow(/at least 4 words/)
    await expect(
      run("ha", "insert into public.lessons (skill, title, status) values ('grammar', 'Empty', 'published')")
    ).rejects.toThrow(/lesson content/)
    await expect(run("ha", "update public.lessons set status = 'published' where id = $1", [lessons.listening])).rejects.toThrow(/listening audio/)
    await expect(
      run("ha", "insert into public.lessons (skill, title, body) values ('writing', 'No mode', 'x')")
    ).rejects.toThrow(/check constraint/)
  })

  it("words: duplicates refused, lists cleaned", async () => {
    await expect(run("ha", "insert into public.vocabulary_words (word, part_of_speech, meaning_vi) values ('CAT', 'noun', 'x')")).rejects.toThrow(
      /vocabulary_words_unique/
    )
    const row = await as(db, ids.ha, async (tx) =>
      (await tx.query<{ synonyms: string[] }>(
        "insert into public.vocabulary_words (word, part_of_speech, meaning_vi, synonyms) values ('cat', 'verb', 'x', '{\" glad \",\"Glad\",\"\"}') returning synonyms"
      )).rows[0]
    )
    expect(row.synonyms).toEqual(["glad"])
  })

  it("media must be an uploaded file of the right kind", async () => {
    await expect(
      run("ha", "update public.vocabulary_words set audio_path = 'english-content/00000000-0000-4000-8000-000000000000.mp3' where word = 'cat'")
    ).rejects.toThrow(/was not found/)
    await expect(
      run("ha", "update public.vocabulary_words set image_path = 'english-content/00000000-0000-4000-8000-000000000000.mp3' where word = 'cat'")
    ).rejects.toThrow(/not an accepted type/)
  })
})

describe("answer keys, transcripts and model answers", () => {
  it("exercise keys are for content editors only", async () => {
    for (const who of ["huy", "chau", "lan", "khang"] as const) expect(await count(who, "select 1 from public.lesson_question_keys")).toBe(0)
    expect(await count("ha", "select 1 from public.lesson_question_keys")).toBe(5)
  })

  it("transcripts and model answers appear only after the student has done the lesson", async () => {
    const privateLessons = (who: Who) =>
      as(db, ids[who], async (tx) => (await column(tx, "select l.skill from public.lesson_private p join public.lessons l on l.id = p.lesson_id")).sort())
    expect(await privateLessons("ha")).toEqual(["listening", "writing"])
    expect(await privateLessons("huy")).toEqual(["writing"]) // handed in writing; not listening
    expect(await privateLessons("lan")).toEqual(["writing"]) // via Huy
    expect(await privateLessons("khang")).toEqual([])
  })
})

describe("vocabulary practice", () => {
  const record = (tx: Session, set: string, activity: string, results: object[]) =>
    tx.query("select public.record_vocabulary_practice($1, $2, $3)", [sets[set], activity, JSON.stringify(results)])
  const setWords = async (tx: Session, set: string) =>
    (await tx.query<{ word_id: string; word: string }>(
      "select w.word_id, v.word from public.vocabulary_set_words w join public.vocabulary_words v on v.id = w.word_id where w.set_id = $1",
      [sets[set]]
    )).rows

  it("seeded spaced repetition: right twice -> box 3, missed last time -> back to box 1", async () => {
    const boxes = await as(db, ids.huy, async (tx) =>
      (await tx.query<{ word: string; box: number }>(
        "select v.word, p.box from public.vocabulary_progress p join public.vocabulary_words v on v.id = p.word_id order by v.word"
      )).rows
    )
    expect(boxes.find((b) => b.word === "giraffe")?.box).toBe(1)
    expect(boxes.filter((b) => b.word !== "giraffe").every((b) => b.box === 3)).toBe(true)
  })

  it("boxes top out at 5 and review dates move further away", async () => {
    const row = await as(db, ids.huy, async (tx) => {
      const words = await setWords(tx, "Jobs")
      for (let i = 0; i < 6; i++) await record(tx, "Jobs", "spelling", words.map((w) => ({ word_id: w.word_id, correct: true })))
      return (await tx.query<{ box: number; due_in: number }>(
        "select box, next_review_on - private.academy_today() as due_in from public.vocabulary_progress where word_id = $1",
        [words[0].word_id]
      )).rows[0]
    })
    expect(row).toEqual({ box: 5, due_in: 14 })
  })

  it("only words of the set, only published sets, only students", async () => {
    await expect(
      as(db, ids.huy, async (tx) => {
        const other = (await setWords(tx, "Jobs"))[0]
        await record(tx, "Animals", "matching", [{ word_id: other.word_id, correct: true }])
      })
    ).rejects.toThrow(/outside this set/)
    await expect(run("huy", "select public.record_vocabulary_practice($1, 'flashcards', '[]')", [sets["Food (draft)"]])).rejects.toThrow(
      /not found/
    )
    for (const who of ["lan", "hung", "admin"] as const) {
      await expect(run(who, "select public.record_vocabulary_practice($1, 'flashcards', '[]')", [sets.Animals])).rejects.toThrow(/Only students/)
    }
    await expect(run("huy", "insert into public.vocabulary_practice (student_id, set_id, activity, correct, total) select id, id, 'flashcards', 9, 9 from public.students limit 1")).rejects.toThrow(
      /permission denied/
    )
  })
})

describe("lesson exercises", () => {
  it("marked in the database; every attempt kept", async () => {
    const result = await as(db, ids.huy, async (tx) => {
      const qs = await lessonQuestionIds(tx, "grammar")
      const responses = Object.fromEntries(
        qs.map((q) => [q.id, q.question_type === "fill_blank" ? { blanks: ["go"] } : { text: "She doesn't like apples" }])
      )
      const id = (await tx.query<{ id: string }>("select public.submit_lesson_practice($1, $2) as id", [lessons.grammar, JSON.stringify(responses)])).rows[0].id
      const row = (await tx.query<{ score: string; max_score: string }>("select score, max_score from public.lesson_attempts where id = $1", [id])).rows[0]
      const attempts = (await tx.query("select 1 from public.lesson_attempts where lesson_id = $1", [lessons.grammar])).rows.length
      return { row, attempts }
    })
    expect(result).toEqual({ row: { score: "1.00", max_score: "2.00" }, attempts: 2 })
  })

  it("malformed answers earn nothing; foreign questions and drafts are refused", async () => {
    const score = await as(db, ids.huy, async (tx) => {
      const [q] = await lessonQuestionIds(tx, "grammar")
      const id = (await tx.query<{ id: string }>("select public.submit_lesson_practice($1, $2) as id", [
        lessons.grammar,
        JSON.stringify({ [q.id]: { blanks: 7 } }),
      ])).rows[0].id
      return (await tx.query<{ score: string }>("select score from public.lesson_attempts where id = $1", [id])).rows[0].score
    })
    expect(score).toBe("0.00")
    await expect(
      as(db, ids.huy, async (tx) => {
        const [q] = await lessonQuestionIds(tx, "reading")
        await tx.query("select public.submit_lesson_practice($1, $2)", [lessons.grammar, JSON.stringify({ [q.id]: { value: true } })])
      })
    ).rejects.toThrow(/outside this lesson/)
    await expect(run("huy", "select public.submit_lesson_practice($1, '{}')", [lessons.listening])).rejects.toThrow(/not found/)
  })

  it("the review (with correct answers) is for the student, their parents and teachers", async () => {
    const attemptOf = async (code: string) =>
      (await db.query<{ id: string }>(
        "select a.id from public.lesson_attempts a join public.students s on s.id = a.student_id where s.student_code = $1 limit 1",
        [code]
      )).rows[0].id
    const huy = await attemptOf("HS001")
    const chau = await attemptOf("HS003")
    const review = (who: Who, attempt: string) =>
      as(db, ids[who], async (tx) =>
        (await tx.query<{ correct_answer: unknown; score: string }>("select correct_answer, score from public.lesson_attempt_review($1)", [attempt])).rows
      )
    const own = await review("huy", huy)
    expect(own.every((r) => r.correct_answer !== null)).toBe(true)
    expect((await review("lan", huy)).length).toBe(own.length)
    expect((await review("hung", chau)).length).toBeGreaterThan(0)
    for (const [who, attempt] of [["chau", huy], ["duc", huy], ["ha", chau], ["khang", huy]] as const) {
      await expect(review(who, attempt)).rejects.toThrow(/Attempt not found/)
    }
  })

  it("exercises freeze once done; only auto-marked question types can be added", async () => {
    await expect(run("ha", "delete from public.lesson_questions where lesson_id = $1", [lessons.grammar])).rejects.toThrow(/cannot change once/)
    await expect(
      as(db, ids.ha, async (tx) => {
        const essay = (await tx.query<{ id: string }>("select id from public.bank_questions where question_type = 'essay' limit 1")).rows[0].id
        await tx.query("select public.add_lesson_questions($1, $2::uuid[])", [lessons.speaking, [essay]])
      })
    ).rejects.toThrow(/marked automatically/)
    await expect(
      run("hung", "select public.add_lesson_questions($1, '{}')", [lessons.reading])
    ).rejects.toThrow(/your own lessons/)
  })
})

describe("speaking, writing and pronunciation work", () => {
  const upload = (tx: Session, path: string, mime: string, size = 5000) =>
    tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, $2)", [path, JSON.stringify({ size, mimetype: mime })])
  const submit = (tx: Session, lesson: string, text: string | null, file: object | null = null) =>
    tx.query<{ id: string }>("select public.submit_lesson_work($1, $2, $3) as id", [lessons[lesson], text, file ? JSON.stringify(file) : null])

  it("a spoken answer is a validated recording in the student's own folder", async () => {
    const status = await as(db, ids.huy, async (tx) => {
      const path = `english/${studentIds.HS001}/${crypto.randomUUID()}.m4a`
      await upload(tx, path, "audio/mp4")
      const { id } = (await submit(tx, "speaking", null, { path, name: "tiger.m4a", mime: "audio/mp4", size: 5000 })).rows[0]
      return (await tx.query<{ status: string; attempt: number }>("select status, attempt from public.lesson_submissions where id = $1", [id])).rows[0]
    })
    expect(status).toEqual({ status: "submitted", attempt: 1 })

    await expect(
      as(db, ids.chau, (tx) => upload(tx, `english/${studentIds.HS001}/${crypto.randomUUID()}.m4a`, "audio/mp4"))
    ).rejects.toThrow(/row-level security/)
    await expect(
      as(db, ids.huy, async (tx) => {
        const path = `english/${studentIds.HS001}/${crypto.randomUUID()}.mp4`
        await upload(tx, path, "video/mp4")
        await submit(tx, "pronunciation", null, { path, name: "me.mp4", mime: "video/mp4", size: 5000 })
      })
    ).rejects.toThrow(/an audio recording/)
    await expect(
      as(db, ids.huy, async (tx) => submit(tx, "speaking", null, { path: `english/${studentIds.HS003}/x.m4a`, name: "x.m4a", mime: "audio/mp4", size: 1 }))
    ).rejects.toThrow(/wrong place|not found/)
    await expect(as(db, ids.huy, (tx) => submit(tx, "speaking", "just text"))).rejects.toThrow(/Upload your recording/)
    await expect(as(db, ids.huy, (tx) => submit(tx, "writing", "  "))).rejects.toThrow(/Write your answer/)
    await expect(as(db, ids.lan, (tx) => submit(tx, "writing", "x"))).rejects.toThrow(/Only students/)
  })

  it("a parent can play their child's recording; other families cannot", async () => {
    const seen = await as(db, ids.huy, async (tx) => {
      const path = `english/${studentIds.HS001}/${crypto.randomUUID()}.m4a`
      await upload(tx, path, "audio/mp4")
      const result: Record<string, number> = {}
      for (const who of ["lan", "duc", "hung", "chau"] as const) {
        await switchUser(tx, ids[who])
        result[who] = (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
      }
      return result
    })
    expect(seen).toEqual({ lan: 1, duc: 0, hung: 1, chau: 0 })
  })

  it("teachers review with the rubric; the score is its sum", async () => {
    const row = await as(db, ids.hung, async (tx) => {
      const id = (await tx.query<{ id: string }>(
        "select s.id from public.lesson_submissions s join public.students st on st.id = s.student_id where st.student_code = 'HS003'"
      )).rows[0].id
      await expect(tx.query("select public.review_lesson_submission($1, 'ok', '[5, 1, 1]')", [id])).rejects.toThrow(/between 0 and its maximum/)
      return id
    })
    const reviewed = await as(db, ids.hung, async (tx) => {
      await tx.query("select public.review_lesson_submission($1, 'Clear and correct. Add how you felt.', '[3, 3, 2]')", [row])
      return (await tx.query<{ status: string; score: string; max_score: string; reviewed_by_name: string }>(
        "select status, score, max_score, reviewed_by_name from public.lesson_submissions where id = $1",
        [row]
      )).rows[0]
    })
    expect(reviewed).toEqual({ status: "reviewed", score: "8.00", max_score: "10.00", reviewed_by_name: "Lê Văn Hùng" })
  })

  it("rubric and feedback are required; only the student's teachers review", async () => {
    const chauWriting = (await db.query<{ id: string }>(
      "select s.id from public.lesson_submissions s join public.students st on st.id = s.student_id where st.student_code = 'HS003'"
    )).rows[0].id
    await expect(run("hung", "select public.review_lesson_submission($1, 'x', '[1, 1]')", [chauWriting])).rejects.toThrow(/every rubric criterion/)
    await expect(run("hung", "select public.review_lesson_submission($1, '  ', '[1, 1, 1]')", [chauWriting])).rejects.toThrow(/Write some feedback/)
    for (const who of ["ha", "chau", "duc"] as const) {
      await expect(run(who, "select public.review_lesson_submission($1, 'x', '[1, 1, 1]')", [chauWriting])).rejects.toThrow(/students you teach/)
    }
    await expect(run("hung", "update public.lesson_submissions set score = 10")).rejects.toThrow(/permission denied/)
  })
})

describe("results by skill", () => {
  const practiceOwners = (who: Who, relation: string) =>
    as(db, ids[who], async (tx) => [...new Set((await column(tx, `select student_id from public.${relation}`)).map((id) => codeOf(String(id))))].sort())

  it.each([
    ["admin", ["HS001", "HS003"]],
    ["hung", ["HS001", "HS003"]],
    ["ha", ["HS001"]],
    ["huy", ["HS001"]],
    ["chau", ["HS003"]],
    ["lan", ["HS001"]],
    ["duc", ["HS003"]],
    ["khang", []],
    ["vinh", []],
  ] as const)("%s sees results of %o", async (who, expected) => {
    const combined = [...new Set([...(await practiceOwners(who, "lesson_attempts")), ...(await practiceOwners(who, "lesson_submissions"))])].sort()
    expect(combined).toEqual([...expected])
  })

  it("performance per skill combines practice, exercises and reviewed work", async () => {
    const rows = await as(db, ids.huy, async (tx) =>
      (await tx.query<{ skill: string; activities: string; average_percent: string }>(
        "select skill, activities, average_percent from public.english_skill_performance()"
      )).rows
    )
    expect(rows).toEqual([
      // flashcards 6/6 and multiple choice 5/6
      { skill: "vocabulary", activities: 2, average_percent: "91.7" },
      { skill: "grammar", activities: 1, average_percent: "100.0" },
      // rubric 4 + 2 + 3 of 10
      { skill: "writing", activities: 1, average_percent: "90.0" },
    ])
  })

  it("a teacher's view covers the students they teach; returned assignment grades with an English skill count", async () => {
    const rows = await as(db, ids.hung, async (tx) => {
      await tx.query(
        "update public.assignments set skill = 'grammar' where title = 'Bài tập Phân số – tuần 3'"
      )
      return (await tx.query<{ student_id: string; skill: string; activities: string }>(
        "select student_id, skill, activities from public.english_skill_performance()"
      )).rows.map((r) => `${codeOf(r.student_id)}:${r.skill}:${r.activities}`).sort()
    })
    // Huy's returned homework (graded 9.5/10) now counts as grammar; Châu's is not returned yet.
    expect(rows).toEqual(["HS001:grammar:2", "HS001:vocabulary:2", "HS001:writing:1", "HS003:reading:1"])
  })
})

describe("storage for content", () => {
  it("only content editors upload word and lesson media", async () => {
    expect(
      await count("ha", "insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}') returning name", [
        `english-content/${crypto.randomUUID()}.mp3`,
      ])
    ).toBe(1)
    await expect(
      run("huy", "insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [`english-content/${crypto.randomUUID()}.mp3`])
    ).rejects.toThrow(/row-level security/)
    // Everyone signed in can listen to published content media.
    const path = `english-content/${crypto.randomUUID()}.mp3`
    const seen = await as(db, ids.ha, async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('assignment-files', $1, '{}')", [path])
      await switchUser(tx, ids.khang)
      return (await tx.query("select 1 from storage.objects where name = $1", [path])).rows.length
    })
    expect(seen).toBe(1)
    void asOwner
  })
})
