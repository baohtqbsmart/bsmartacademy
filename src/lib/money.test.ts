import { describe, expect, it } from "vitest"

import { amountInVietnameseWords, formatVnd } from "@/lib/money"

describe("formatVnd", () => {
  it("formats whole đồng with Vietnamese separators", () => {
    expect(formatVnd(1500000).replace(/\s/g, " ")).toBe("1.500.000 ₫")
    expect(formatVnd("0").replace(/\s/g, " ")).toBe("0 ₫")
  })
})

describe("amountInVietnameseWords", () => {
  it.each([
    [0, "Không đồng"],
    [5_000, "Năm nghìn đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [24, "Hai mươi tư đồng"],
    [105, "Một trăm linh năm đồng"],
    [110, "Một trăm mười đồng"],
    [1_005_000, "Một triệu không trăm linh năm nghìn đồng"],
    [12_600_000, "Mười hai triệu sáu trăm nghìn đồng"],
    [3_375_000, "Ba triệu ba trăm bảy mươi lăm nghìn đồng"],
    [1_000_000_000, "Một tỷ đồng"],
    [2_000_001, "Hai triệu không trăm linh một đồng"],
  ])("%d", (amount, words) => {
    expect(amountInVietnameseWords(amount)).toBe(words)
  })
})
