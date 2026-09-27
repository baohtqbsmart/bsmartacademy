import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  hrefForPage: (page: number) => string
}

/** "Showing 21–40 of 57" with previous/next links (server-rendered). */
export async function Pagination({ page, pageSize, total, hrefForPage }: PaginationProps) {
  const t = await getT()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label={t("Pagination")}>
      <p className="text-muted-foreground">
        {total === 0 ? t("No results") : t("Showing {first}–{last} of {total}", { first, last, total })}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          {t("Page {Math} of {pageCount}", { Math: Math.min(page, pageCount), pageCount })}
        </span>
        <PageLink href={page > 1 ? hrefForPage(page - 1) : null} label={t("Previous page")}>
          <ChevronLeftIcon />
        </PageLink>
        <PageLink href={page < pageCount ? hrefForPage(page + 1) : null} label={t("Next page")}>
          <ChevronRightIcon />
        </PageLink>
      </div>
    </nav>
  )
}

async function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const t = await getT()
  if (!href) {
    return (
      <Button variant="outline" size="icon" disabled aria-label={t(label)}>
        {children}
      </Button>
    )
  }
  return (
    <Button variant="outline" size="icon" asChild>
      <Link href={href} aria-label={t(label)} scroll={false}>
        {children}
      </Link>
    </Button>
  )
}
