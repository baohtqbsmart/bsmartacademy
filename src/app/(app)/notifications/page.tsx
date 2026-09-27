import { BellOffIcon, SettingsIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { TabNav } from "@/components/shared/tab-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { NotificationList } from "@/features/communication/components/notification-list"
import { listNotifications } from "@/features/communication/server/communication-service"
import { can } from "@/lib/auth/permissions"
import { requireUser } from "@/lib/auth/session"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Notifications" }

// Every signed-in user has notifications; RLS returns only the caller's own.
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser()
  const show = enumParam(await searchParams, "show", ["unread"] as const)
  const items = await listNotifications(await createClient(), { unreadOnly: show === "unread" })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In the app only — e-mail, SMS and Zalo delivery are not connected."
        actions={
          <Button variant="outline" asChild>
            <Link href={routes.notificationSettings}>
              <SettingsIcon aria-hidden /> Settings
            </Link>
          </Button>
        }
      />
      <TabNav
        label="Notifications"
        active={show ?? "all"}
        tabs={[
          { value: "all", label: "All", href: routes.notifications },
          { value: "unread", label: "Unread", href: `${routes.notifications}?show=unread` },
        ]}
      />
      {items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={BellOffIcon} title={show ? "Nothing unread" : "No notifications yet"} />
          </CardContent>
        </Card>
      ) : (
        <NotificationList items={items} showChild={can(user.permissions, "students.read", ["children"])} />
      )}
    </>
  )
}
