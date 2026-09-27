import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
import Link from "next/link"

import { studentListHref, type StudentListQuery, type StudentSort } from "@/features/students/list-query"

type SortableHeaderProps = {
  label: string
  sort: StudentSort
  query: StudentListQuery
}

export function SortableHeader({ label, sort, query }: SortableHeaderProps) {
  const active = query.sort === sort
  const nextDir = active && query.dir === "asc" ? "desc" : "asc"
  const Icon = !active ? ArrowUpDownIcon : query.dir === "asc" ? ArrowUpIcon : ArrowDownIcon

  return (
    <Link
      href={studentListHref(query, { sort, dir: nextDir, page: 1 })}
      scroll={false}
      className="hover:text-foreground inline-flex items-center gap-1"
      aria-label={`Sort by ${label.toLowerCase()} ${nextDir === "asc" ? "ascending" : "descending"}`}
    >
      {label}
      <Icon className={active ? "size-3.5" : "size-3.5 opacity-40"} aria-hidden />
    </Link>
  )
}
