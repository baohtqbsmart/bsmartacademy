import Link from "next/link"

import { cn } from "@/lib/utils"

type TabNavProps = {
  tabs: { value: string; label: string; href: string }[]
  active: string
  label: string
}

/** URL-driven tabs: each tab is a link, so only the active tab's data is loaded. */
export function TabNav({ tabs, active, label }: TabNavProps) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const isActive = tab.value === active
          return (
            <li key={tab.value}>
              <Link
                href={tab.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
