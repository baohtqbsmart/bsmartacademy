"use client"

import { BellIcon, BookMarkedIcon, BookOpenIcon, ClipboardListIcon, HeartHandshakeIcon, HouseIcon, NotebookTextIcon, UserRoundIcon, type LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { canAccessRoute } from "@/config/access"
import { routes } from "@/config/routes"
import { useT } from "@/i18n/client"
import type { PermissionGrants } from "@/lib/auth/permissions"
import { cn } from "@/lib/utils"

type Tab = { title: string; href: string; icon: LucideIcon }

/** Bottom navigation on phones: the five places people go most, reachable with a thumb. */
export function MobileTabBar({ permissions, roleCode }: { permissions: PermissionGrants; roleCode: string }) {
  const t = useT()
  const pathname = usePathname()
  const tabs: Tab[] = (roleCode === "member" ? [
    { title: "Home", href: routes.dashboard, icon: HouseIcon },
    { title: "Free lessons", href: routes.resources, icon: NotebookTextIcon },
    { title: "Dictionary", href: routes.dictionary, icon: BookMarkedIcon },
    { title: "Notifications", href: routes.notifications, icon: BellIcon },
    { title: "Me", href: routes.profile, icon: UserRoundIcon },
  ] : [
    { title: "Home", href: routes.dashboard, icon: HouseIcon },
    roleCode === "parent"
      ? { title: "My family", href: routes.family, icon: HeartHandshakeIcon }
      : { title: roleCode === "student" ? "Courses" : "Classes", href: routes.classes, icon: BookOpenIcon },
    { title: "Assignments", href: routes.assignments, icon: ClipboardListIcon },
    { title: "Notifications", href: routes.notifications, icon: BellIcon },
    { title: "Me", href: routes.profile, icon: UserRoundIcon },
  ]).filter((tab) => canAccessRoute(permissions, tab.href))

  return (
    <nav
      aria-label={t("Main")}
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="bg-primary absolute top-0 h-0.5 w-10 rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <motion.span animate={{ scale: active ? 1.1 : 1 }} transition={{ duration: 0.2 }}>
                  <tab.icon className="size-5" aria-hidden />
                </motion.span>
                {t(tab.title)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
