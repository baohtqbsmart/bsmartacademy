import { describe, expect, it } from "vitest"

import {
  bestAttempts,
  describeKey,
  describeResponse,
  isAnswered,
  optionOrder,
  prepareMatching,
  scoreDistribution,
  summarizeScores,
  type QuestionContent,
  type Response,
} from "@/features/tests/questions"

describe("prepareMatching", () => {
  it("shuffles the answers and keeps a key that points to the right ones", () => {
    const pairs = [
      { left: "cat", right: "meow" },
      { left: "cow", right: "moo" },
      { left: "bee", right: "buzz" },
    ]
    const values = [0.1, 0.9, 0.5, 0.3]
    const { left, right, key } = prepareMatching(pairs, () => values.shift() ?? 0)
    expect(left).toEqual(["cat", "cow", "bee"])
    expect([...right].sort()).toEqual(["buzz", "meow", "moo"])
    expect(key.map((k, i) => [left[i], right[k]])).toEqual([
      ["cat", "meow"],
      ["cow", "moo"],
      ["bee", "buzz"],
    ])
  })
})

describe("describing answers", () => {
  const options = { options: ["a", "b", "c"] }
  it.each([
    ["multiple_choice", options, { choice: 1 }, "b"],
    ["multiple_response", options, { choices: [0, 2] }, "a, c"],
    ["true_false", {}, { value: false }, "False"],
    ["matching", { left: ["x", "y"], right: ["1", "2"] }, { pairs: [1, -1] }, "x → 2; y → —"],
    ["fill_blank", { blank_count: 2 }, { blanks: ["goes", ""] }, "goes | —"],
    ["essay", {}, { text: "Hello" }, "Hello"],
    ["speaking", {}, { file: { path: "p", name: "rec.webm", mime: "audio/webm", size: 1 } }, "Recording: rec.webm"],
    ["essay", {}, { text: "   " }, null],
    ["multiple_choice", options, null, null],
  ] as const)("%s %o", (type, content, response, expected) => {
    expect(describeResponse(type, content as QuestionContent, response as Response | null)).toBe(expected)
  })

  it("describes keys", () => {
    expect(describeKey("multiple_response", { options: ["a", "b", "c"] }, { correct: [0, 2] })).toBe("a, c")
    expect(describeKey("fill_blank", { blank_count: 2 }, { blanks: [["goes", "walks"], ["3/4"]] })).toBe("goes / walks | 3/4")
    expect(describeKey("essay", {}, {})).toBeNull()
    expect(describeKey("true_false", {}, null)).toBeNull()
  })

  it("knows when a question was left empty", () => {
    expect(isAnswered({ pairs: [-1, -1] })).toBe(false)
    expect(isAnswered({ blanks: ["", " "] })).toBe(false)
    expect(isAnswered({ choice: 0 })).toBe(true)
    expect(isAnswered({ value: false })).toBe(true)
  })
})

describe("optionOrder", () => {
  it("uses the attempt's order when present, else the original", () => {
    expect(optionOrder({ q1: [2, 0, 1] }, "q1", 3)).toEqual([2, 0, 1])
    expect(optionOrder({}, "q1", 3)).toEqual([0, 1, 2])
    expect(optionOrder({ q1: [0] }, "q1", 3)).toEqual([0, 1, 2]) // stale order is ignored
  })
})

describe("analytics", () => {
  it("summarises scores", () => {
    expect(summarizeScores([8, 6, 10, 4])).toEqual({ count: 4, average: 7, median: 7, highest: 10, lowest: 4 })
    expect(summarizeScores([])).toMatchObject({ count: 0, average: null })
  })

  it("keeps each student's best graded attempt", () => {
    const best = bestAttempts([
      { student_id: "a", attempt_number: 1, status: "graded", score: 6 },
      { student_id: "a", attempt_number: 2, status: "graded", score: 8 },
      { student_id: "b", attempt_number: 1, status: "submitted", score: 3 },
      { student_id: "b", attempt_number: 2, status: "graded", score: 5 },
    ] as const)
    expect(best.map((a) => [a.student_id, a.attempt_number])).toEqual([
      ["a", 2],
      ["b", 2],
    ])
  })

  it("puts scores in ten bands, the top score in the last", () => {
    const bands = scoreDistribution([10, 9.9, 5, 0, 0.5], 10)
    expect(bands.map((b) => b.students)).toEqual([2, 0, 0, 0, 0, 1, 0, 0, 0, 2])
    expect(bands[9].label).toBe("90–100%")
  })
})
