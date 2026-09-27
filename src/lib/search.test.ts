import { describe, expect, it } from "vitest"

import { escapeLike, normalizeSearch } from "@/lib/search"

describe("normalizeSearch", () => {
  it.each([
    ["Nguyễn Gia Huy", "nguyen gia huy"],
    ["  ĐỖ   Phương  Linh ", "do phuong linh"],
    ["HS001", "hs001"],
    ["Trương Bảo Khang", "truong bao khang"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected)
  })
})

describe("escapeLike", () => {
  it("escapes wildcards and backslashes", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\")
  })
})
