"use client"

import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { BrandMark } from "@/components/layout/brand"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { navigationFor } from "@/config/navigation"
import { routes } from "@/config/routes"
import { siteConfig } from "@/config/site"
import type { PermissionGrants } from "@/lib/auth/permissions"
import { useT } from "@/i18n/client"

export function AppSidebar({ permissions, roleCode }: { permissions: PermissionGrants; roleCode: string }) {
  const t = useT()
  const pathname = usePathname()
  const sections = navigationFor(permissions, roleCode)
  // Highlight only the most specific matching item ("/tuition/invoices", not also "/tuition").
  const activeHref = sections
    .flatMap((section) => section.items.map((item) => item.href.split("?")[0]))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={routes.dashboard}>
                <BrandMark />
                <span className="font-heading truncate text-base font-semibold tracking-wide text-[var(--brand-cream)]">{siteConfig.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sidebar-label text-[11px] font-semibold tracking-wider uppercase">{t(section.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={t(item.title)}
                      isActive={item.href === activeHref}
                      className="relative data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground"
                    >
                      <Link href={item.href}>
                        {item.href === activeHref && (
                          // The brown pill glides to the chosen item.
                          <motion.span
                            layoutId="sidebar-active"
                            className="bg-sidebar-primary absolute inset-0 rounded-md shadow-sm"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          />
                        )}
                        <item.icon aria-hidden className="relative" />
                        <span className="relative">{t(item.title)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
