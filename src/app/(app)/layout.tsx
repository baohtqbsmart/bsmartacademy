import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { Separator } from "@/components/ui/separator"
import { NotificationBell } from "@/features/communication/components/notification-bell"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { routes } from "@/config/routes"
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
      <AppSidebar permissions={user.permissions} />
      <SidebarInset>
        <header className="bg-background/95 border-b-brand-navy/25 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
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
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 print:p-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
