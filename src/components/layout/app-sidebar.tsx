"use client"

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

export function AppSidebar({ permissions }: { permissions: PermissionGrants }) {
  const t = useT()
  const pathname = usePathname()
  const sections = navigationFor(permissions)
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
                <span className="text-primary truncate font-semibold tracking-wide">{siteConfig.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sidebar-label font-semibold tracking-wide uppercase">{t(section.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={t(item.title)}
                      isActive={item.href === activeHref}
                    >
                      <Link href={item.href}>
                        <item.icon aria-hidden />
                        <span>{t(item.title)}</span>
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
