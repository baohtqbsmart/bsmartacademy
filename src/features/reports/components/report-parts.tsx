import { FilterIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Column, FilterKey, Row } from "@/features/reports/catalog"
import type { ParsedFilters } from "@/features/reports/filters"
import { formatDate } from "@/lib/format"
import { getT } from "@/i18n/server"

type Options = { classes: { id: string; name: string }[]; teachers: { id: string; full_name: string }[]; courses: { id: string; name: string }[]; levels: { id: string; name: string }[]; students: { id: string; name: string }[] }

const SELECTS: { key: Exclude<FilterKey, "from" | "to">; label: string; all: string; field: keyof ParsedFilters; options: (o: Options) => { id: string; name: string }[] }[] = [
  { key: "class", label: "Class", all: "All classes", field: "classId", options: (o) => o.classes },
  { key: "teacher", label: "Teacher", all: "All teachers", field: "teacherId", options: (o) => o.teachers.map((t) => ({ id: t.id, name: t.full_name })) },
  { key: "course", label: "Course", all: "All courses", field: "courseId", options: (o) => o.courses },
  { key: "level", label: "Level", all: "All levels", field: "levelId", options: (o) => o.levels },
  { key: "student", label: "Student", all: "All students", field: "studentId", options: (o) => o.students },
]

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"

/** A plain GET form: works before JavaScript loads and keeps filters in the URL (shareable, printable). */
export async function ReportFilters({ action, filters, values, options, today }: { action: string; filters: readonly FilterKey[]; values: ParsedFilters; options: Options; today: string }) {
  const t = await getT()
  return (
    <form action={action} method="get" className="grid gap-3 rounded-lg border p-3 print:hidden sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-1">
        <Label htmlFor="f-from">{t("From")}</Label>
        <Input id="f-from" name="from" type="date" defaultValue={values.from} max={today} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="f-to">{t("To")}</Label>
        <Input id="f-to" name="to" type="date" defaultValue={values.to} max={today} />
      </div>
      {SELECTS.filter((s) => filters.includes(s.key)).map((s) => (
        <div key={s.key} className="grid gap-1">
          <Label htmlFor={`f-${s.key}`}>{t(s.label)}</Label>
          <select id={`f-${s.key}`} name={s.key} defaultValue={(values[s.field] as string | undefined) ?? ""} className={selectClass}>
            <option value="">{t(s.all)}</option>
            {s.options(options).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <Button type="submit">
          <FilterIcon aria-hidden /> {t("Apply")}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={action}>{t("Reset")}</Link>
        </Button>
      </div>
    </form>
  )
}

export function formatCell(column: Column, value: Row[string]) {
  if (value === null || value === undefined || value === "") return "—"
  switch (column.kind) {
    case "percent":
      return `${value}%`
    case "money":
      return `${Number(value).toLocaleString("vi-VN")} đ`
    case "date":
      return formatDate(String(value))
    case "number":
      return Number(value).toLocaleString("vi-VN")
    default:
      return String(value).replaceAll("_", " ")
  }
}

export async function ReportTable({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  const t = await getT()
  if (rows.length === 0) return <p className="text-muted-foreground py-6 text-center text-sm">{t("No rows for these filters.")}</p>
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-left text-sm print:text-[10px]">
        <thead className="text-muted-foreground text-xs">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.kind === "text" || c.kind === "date" ? "px-2 py-2 font-medium" : "px-2 py-2 text-right font-medium"}>
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => (
            <tr key={i} className="border-t break-inside-avoid">
              {columns.map((c) => (
                <td key={c.key} className={c.kind === "text" || c.kind === "date" ? "px-2 py-1.5" : "px-2 py-1.5 text-right whitespace-nowrap"}>
                  {c.key === "status" ? t(formatCell(c, r[c.key])) : formatCell(c, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
