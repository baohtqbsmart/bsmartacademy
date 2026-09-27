import { describe, expect, it } from "vitest"

import { slugify } from "@/lib/slug"

describe("slugify", () => {
  it.each([
    ["Thì hiện tại đơn – Present Simple", "thi-hien-tai-don-present-simple"],
    ["Đọc hiểu: Gia đình Tom!", "doc-hieu-gia-dinh-tom"],
    ["  English   Present  Simple ", "english-present-simple"],
    ["Bài 1.2 — IELTS 6.5+", "bai-1-2-ielts-6-5"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it("stays within the length limit without a trailing dash", () => {
    const slug = slugify("a ".repeat(100), 21)
    expect(slug.length).toBeLessThanOrEqual(21)
    expect(slug.endsWith("-")).toBe(false)
  })
})
