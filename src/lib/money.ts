/** Money is Vietnamese đồng in whole units (the database stores numeric(14,0)). */

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 })

/** 1500000 -> "1.500.000 ₫" */
export function formatVnd(amount: number | string | null | undefined) {
  return vnd.format(Number(amount ?? 0))
}

/** 12600000 -> "12,6 Tr" (axis ticks). */
export function formatVndCompact(amount: number) {
  return compact.format(amount)
}

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
const GROUP_UNITS = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ"]

/** Reads a 3-digit group; `full` forces "không trăm"/"linh" inside larger numbers. */
function readGroup(value: number, full: boolean) {
  const hundreds = Math.floor(value / 100)
  const tens = Math.floor(value / 10) % 10
  const units = value % 10
  const words: string[] = []

  if (full || hundreds > 0) words.push(DIGITS[hundreds], "trăm")

  if (tens === 0) {
    if (units > 0) words.push(...(full || hundreds > 0 ? ["linh"] : []), DIGITS[units])
  } else if (tens === 1) {
    words.push("mười")
    if (units === 5) words.push("lăm")
    else if (units > 0) words.push(DIGITS[units])
  } else {
    words.push(DIGITS[tens], "mươi")
    if (units === 1) words.push("mốt")
    else if (units === 4) words.push("tư")
    else if (units === 5) words.push("lăm")
    else if (units > 0) words.push(DIGITS[units])
  }
  return words.join(" ")
}

/**
 * Amount in Vietnamese words, as printed on receipts ("bằng chữ"):
 * 3375000 -> "Ba triệu ba trăm bảy mươi lăm nghìn đồng".
 */
export function amountInVietnameseWords(amount: number) {
  const value = Math.round(Math.abs(amount))
  if (value === 0) return "Không đồng"
  if (value >= 1e15) throw new RangeError("Amount too large to read.")

  const groups: number[] = []
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000)

  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const isLeading = i === groups.length - 1
    parts.push([readGroup(groups[i], !isLeading), GROUP_UNITS[i]].filter(Boolean).join(" "))
  }
  const sentence = `${parts.join(" ")} đồng`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
