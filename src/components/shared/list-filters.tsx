"use client"

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { withParams } from "@/lib/search-params"
import { useT } from "@/i18n/client"

const ALL = "__all"

export type FilterConfig = {
  param: string
  /** Label of the "no filter" option, e.g. "All statuses". */
  allLabel: string
  options: { value: string; label: string }[]
  /** Value applied when the parameter is absent (shown as selected). */
  defaultValue?: string
}

type ListFiltersProps = {
  basePath: string
  /** Current query-string values (parsed on the server). */
  values: Record<string, string | undefined>
  searchPlaceholder?: string
  filters: FilterConfig[]
  /** Parameters kept in the URL but not treated as filters (e.g. the week). */
  preserve?: Record<string, string | undefined>
}

/**
 * Search box + select filters that write to the URL. The server page reads
 * the same parameters, so lists are shareable and survive reloads.
 */
export function ListFilters({ basePath, values, searchPlaceholder, filters, preserve = {} }: ListFiltersProps) {
  const t = useT()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(values.q ?? "")
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  function navigate(changes: Record<string, string | undefined>) {
    startTransition(() => {
      router.replace(withParams(basePath, { ...preserve, ...values, ...changes }), { scroll: false })
    })
  }

  function onSearchChange(value: string) {
    setSearch(value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => navigate({ q: value.trim() || undefined }), 300)
  }

  const active = Object.values(values).some(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      {searchPlaceholder && (
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t(searchPlaceholder)}
            aria-label={t(searchPlaceholder)}
            className="pl-8"
          />
        </div>
      )}
      {filters.map((filter) => (
        <Select
          key={filter.param}
          value={values[filter.param] ?? filter.defaultValue ?? ALL}
          onValueChange={(value) => navigate({ [filter.param]: value === ALL ? undefined : value })}
        >
          <SelectTrigger className="w-44" aria-label={t(filter.allLabel)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!filter.defaultValue && <SelectItem value={ALL}>{t(filter.allLabel)}</SelectItem>}
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearTimeout(debounce.current)
            setSearch("")
            startTransition(() => router.replace(withParams(basePath, preserve), { scroll: false }))
          }}
        >
          <XIcon aria-hidden /> {t("Clear")}
        </Button>
      )}
      {isPending && <Loader2Icon className="text-muted-foreground size-4 animate-spin" aria-label={t("Loading")} />}
    </div>
  )
}
