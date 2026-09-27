import { describe, expect, it } from "vitest"

import { countWords, criterionAverages, formatSeconds, ieltsBand, segments, totalScore, validScore } from "@/features/assessments/scoring"

describe("scores", () => {
  it.each([
    [[6, 7, 6, 7], 6.5],
    [[6, 6, 6, 7], 6.5],
    [[7, 7, 7, 6], 7],
    [[5, 6, 6, 6], 6],
    [[5, 5, 6, 6], 5.5],
    [[9, 9, 9, 9], 9],
  ])("IELTS-style band of %o is %s (same rule as the database)", (scores, band) => {
    expect(ieltsBand(scores)).toBe(band)
  })

  it("points add up; bands and half points are validated like the database", () => {
    expect(totalScore("points", [4.5, 4, 3, 5])).toBe(16.5)
    expect(validScore("ielts_band", { name: "TR", max_points: 9 }, 6.5)).toBe(false)
    expect(validScore("ielts_band", { name: "TR", max_points: 9 }, 7)).toBe(true)
    expect(validScore("points", { name: "C", max_points: 5 }, 4.5)).toBe(true)
    expect(validScore("points", { name: "C", max_points: 5 }, 4.25)).toBe(false)
    expect(validScore("points", { name: "C", max_points: 5 }, 6)).toBe(false)
  })

  it("counts words like the database", () => {
    expect(countWords("  My school is big and green.  ")).toBe(6)
    expect(countWords("   ")).toBe(0)
  })
})

describe("highlights", () => {
  it("cuts the text into plain and highlighted parts", () => {
    const text = "They was happy and we eat cake."
    const parts = segments(text, [
      { id: "b", start: 19, end: 25 },
      { id: "a", start: 0, end: 8 },
    ])
    expect(parts.map((p) => [p.text, p.highlight?.id ?? null])).toEqual([
      ["They was", "a"],
      [" happy and ", null],
      ["we eat", "b"],
      [" cake.", null],
    ])
    expect(parts.map((p) => p.text).join("")).toBe(text)
  })

  it("ignores highlights outside the text or overlapping an earlier one", () => {
    const parts = segments("abcdef", [
      { id: "a", start: 0, end: 3 },
      { id: "b", start: 2, end: 4 },
      { id: "c", start: 5, end: 99 },
    ])
    expect(parts.map((p) => p.highlight?.id ?? null)).toEqual(["a", null])
  })

  it("formats seconds", () => {
    expect(formatSeconds(75.6)).toBe("1:15")
  })
})

describe("history", () => {
  it("averages each criterion as a share of its maximum, weakest first", () => {
    const criteria = [
      { name: "Content", max_points: 5 },
      { name: "Grammar", max_points: 5 },
    ]
    expect(
      criterionAverages([
        { criteria, scores: [5, 2] },
        { criteria, scores: [4, 3] },
      ])
    ).toEqual([
      { name: "Grammar", average: 0.5, count: 2 },
      { name: "Content", average: 0.9, count: 2 },
    ])
  })
})
