import { describe, expect, it } from "vitest"

import {
  blankExample,
  buildBlankQuestions,
  buildChoiceQuestions,
  sameAnswer,
  skillProfile,
  weakestSkill,
  type PracticeWord,
} from "@/features/english/skills"

const word = (id: string, w: string, example: string | null = null): PracticeWord => ({
  id,
  word: w,
  ipa: null,
  part_of_speech: "noun",
  meaning_vi: `nghĩa ${w}`,
  definition_en: `definition of ${w}`,
  example,
  audioUrl: null,
  imageUrl: null,
})

describe("answers", () => {
  it.each([
    ["Giraffe", "giraffe", true],
    ["  giraffe. ", "giraffe", true],
    ["giraf", "giraffe", false],
    ["", "", false],
    ["ice  cream", "ice cream", true],
  ])("%s vs %s", (given, expected, same) => {
    expect(sameAnswer(given, expected)).toBe(same)
  })

  it("blanks the word (and its plural) in the example", () => {
    expect(blankExample("rabbit", "The rabbit is eating a carrot.")).toEqual({ sentence: "The ___ is eating a carrot.", answer: "rabbit" })
    expect(blankExample("tiger", "We saw two Tigers.")).toEqual({ sentence: "We saw two ___.", answer: "Tigers" })
    expect(blankExample("cat", "The category is wrong.")).toBeNull()
    expect(blankExample("cat", null)).toBeNull()
  })
})

describe("practice rounds", () => {
  const words = [word("1", "cat", "My cat sleeps."), word("2", "dog"), word("3", "tiger", "A tiger ran."), word("4", "rabbit"), word("5", "cow")]

  it("choice questions have the answer and up to 3 distractors from the set", () => {
    const questions = buildChoiceQuestions(words, () => 0.3)
    expect(questions).toHaveLength(5)
    for (const q of questions) {
      expect(q.options).toContain(q.answer)
      expect(new Set(q.options).size).toBe(4)
    }
  })

  it("fill-in questions only for words whose example contains them", () => {
    expect(buildBlankQuestions(words).map((q) => q.wordId).sort()).toEqual(["1", "3"])
  })
})

describe("skill profile", () => {
  it("lists every skill in order and finds the weakest practised one", () => {
    const profile = skillProfile([
      { skill: "writing", activities: "1", average_percent: "90.0", last_activity: null },
      { skill: "grammar", activities: 2, average_percent: 55, last_activity: null },
    ])
    expect(profile.map((p) => p.skill)).toEqual(["vocabulary", "grammar", "reading", "listening", "speaking", "writing", "pronunciation"])
    expect(profile[0]).toMatchObject({ activities: 0, average_percent: null })
    expect(weakestSkill(profile)).toBe("grammar")
    expect(weakestSkill(skillProfile([]))).toBe("vocabulary")
  })
})
