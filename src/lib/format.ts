/** "Nguyen Van An" -> "NA"; falls back to the first letter of `fallback`. */
export function getInitials(name: string, fallback = "?") {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback.charAt(0).toUpperCase() || "?"
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ""
  return (first + last).toUpperCase()
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
})

/** Formats a Postgres `date` ("2026-09-07") as "07/09/2026"; empty values as "—". */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  return dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

/** "2026-09-07" + "2027-05-28" -> "07/09/2026 – 28/05/2027". */
export function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "—"
  return `${formatDate(start)} – ${formatDate(end)}`
}

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
})

/** An instant (timestamptz) in academy time: "30/09/2026 18:00". */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]))
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}
