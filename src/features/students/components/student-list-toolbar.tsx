"use client"

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ENGLISH_FRAMEWORK_LABELS, STUDENT_STATUS } from "@/config/labels"
import {
  STUDENT_STATUSES,
  hasActiveFilters,
  studentListHref,
  type StudentListQuery,
} from "@/features/students/list-query"
import type { Enums } from "@/types/database"
import { useT } from "@/i18n/client"

const ALL = "all"

type StudentListToolbarProps = {
  query: StudentListQuery
  levels: { code: string; name: string; framework: Enums<"english_framework"> }[]
  classes: { id: string; name: string }[]
  canSeeArchived: boolean
}

/** Search box and filters. Every change updates the URL; the server re-queries. */
export function StudentListToolbar({ query, levels, classes, canSeeArchived }: StudentListToolbarProps) {
  const t = useT()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(query.q)
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  function navigate(changes: Partial<StudentListQuery>) {
    startTransition(() => {
      router.replace(studentListHref(query, { ...changes, page: 1 }), { scroll: false })
    })
  }

  function onSearchChange(value: string) {
    setSearch(value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => navigate({ q: value.trim() }), 300)
  }

  function clearAll() {
    clearTimeout(debounce.current)
    setSearch("")
    navigate({ q: "", status: undefined, level: undefined, class: undefined, archived: undefined })
  }

  const frameworks = Object.keys(ENGLISH_FRAMEWORK_LABELS) as Enums<"english_framework">[]

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-72">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("Search name, ID, phone, email")}
          aria-label={t("Search students")}
          className="pl-8"
        />
      </div>

      <Select value={query.status ?? ALL} onValueChange={(v) => navigate({ status: v === ALL ? undefined : (v as StudentListQuery["status"]) })}>
        <SelectTrigger className="w-36" aria-label={t("Filter by status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("All statuses")}</SelectItem>
          {STUDENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(STUDENT_STATUS[status].label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={query.level ?? ALL} onValueChange={(v) => navigate({ level: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-44" aria-label={t("Filter by English level")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("All English levels")}</SelectItem>
          {frameworks.map((framework) => (
            <SelectGroup key={framework}>
              <SelectLabel>{t(ENGLISH_FRAMEWORK_LABELS[framework])}</SelectLabel>
              {levels
                .filter((level) => level.framework === framework)
                .map((level) => (
                  <SelectItem key={level.code} value={level.code}>
                    {level.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select value={query.class ?? ALL} onValueChange={(v) => navigate({ class: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-48" aria-label={t("Filter by class")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("All classes")}</SelectItem>
          {classes.map((klass) => (
            <SelectItem key={klass.id} value={klass.id}>
              {klass.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {canSeeArchived && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            id="show-archived"
            checked={Boolean(query.archived)}
            onCheckedChange={(checked) => navigate({ archived: checked === true ? "1" : undefined })}
          />
          <Label htmlFor="show-archived" className="font-normal">
            {t("Archived only")}
          </Label>
        </div>
      )}

      {(hasActiveFilters(query) || search) && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <XIcon aria-hidden />
          {t("Clear")}
        </Button>
      )}

      {isPending && <Loader2Icon className="text-muted-foreground size-4 animate-spin" aria-label={t("Loading")} />}
    </div>
  )
}
