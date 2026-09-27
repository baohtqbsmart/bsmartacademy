import { BellIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { syncAndCountUnread } from "@/features/communication/server/communication-service"
import { createClient } from "@/lib/supabase/server"

/** Header bell: creates due reminders for the caller, then shows the unread count. */
export async function NotificationBell() {
  let unread = 0
  try {
    unread = await syncAndCountUnread(await createClient())
  } catch (error) {
    // The bell must never break a page.
    console.error("[notifications] bell failed", error)
  }
  const label = unread === 0 ? "Notifications" : `Notifications, ${unread} unread`
  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href={routes.notifications} aria-label={label} title={label}>
        <BellIcon />
        {unread > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums" aria-hidden>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}
