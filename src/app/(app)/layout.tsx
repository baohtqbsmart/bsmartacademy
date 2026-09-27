import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { MobileTabBar } from "@/components/layout/mobile-tab-bar"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { routes } from "@/config/routes"
import { NotificationBell } from "@/features/communication/components/notification-bell"
import { roleLabel } from "@/lib/auth/roles"
import { requireUser } from "@/lib/auth/session"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  // Accounts handed out with a default password choose their own first.
  if (user.mustChangePassword) redirect(routes.setPassword)
  const avatarUrl = await createSignedUrl(await createClient(), BUCKETS.avatars, user.avatarPath)

  return (
    <SidebarProvider>
      <AppSidebar permissions={user.permissions} roleCode={user.roleCode} />
      <SidebarInset>
        <header className="bg-background/90 sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-md md:px-6 print:hidden">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <UserMenu
              name={user.fullName}
              email={user.email}
              roleLabel={roleLabel(user.roleCode)}
              avatarUrl={avatarUrl}
            />
          </div>
        </header>
        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <main className="flex flex-1 flex-col gap-6 p-4 pb-24 md:p-6 md:pb-6 print:p-0">{children}</main>
        <MobileTabBar permissions={user.permissions} roleCode={user.roleCode} />
      </SidebarInset>
    </SidebarProvider>
  )
}
