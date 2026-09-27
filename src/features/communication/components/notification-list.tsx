"use client"

import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  UserXIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { markNotificationsReadAction } from "@/features/communication/actions"
import type { NotificationKind } from "@/features/communication/server/communication-service"
import { cn } from "@/lib/utils"
import { translateNotificationBody, translateNotificationTitle } from "@/features/communication/notification-text"
import { useT } from "@/i18n/client"

const ICONS: Record<NotificationKind, LucideIcon> = {
  new_assignment: ClipboardListIcon,
  homework_due: CalendarClockIcon,
  new_grade: GraduationCapIcon,
  absence: UserXIcon,
  schedule_change: CalendarClockIcon,
  tuition_due: WalletIcon,
  new_announcement: MegaphoneIcon,
  message: MessageSquareIcon,
  system: BellIcon,
}

type Item = {
  id: string
  kind: NotificationKind
  title: string
  body: string
  link: string | null
  created_at: string
  read_at: string | null
  student: { id: string; full_name: string } | null
}

const timeFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })

export function NotificationList({ items, showChild }: { items: Item[]; showChild: boolean }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const unread = items.filter((i) => !i.read_at).length
  const mark = (ids: string[] | "all") =>
    startTransition(async () => {
      const result = await markNotificationsReadAction({ ids })
      if (!result.ok) toast.error(result.error.message)
    })

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm" aria-live="polite">
          {t("{unread} unread", { unread })}
        </span>
        <Button variant="outline" size="sm" disabled={unread === 0 || isPending} onClick={() => mark("all")}>
          <CheckCheckIcon aria-hidden /> {t("Mark all read")}
        </Button>
      </div>
      <ul className="grid gap-2">
        {items.map((n) => {
          const Icon = ICONS[n.kind]
          const content = (
            <>
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n.read_at ? "bg-muted" : "bg-primary/10 text-primary")}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn("text-sm", !n.read_at && "font-semibold")}>
                  {!n.read_at && <span className="sr-only">{t("Unread:")} </span>}
                  {translateNotificationTitle(t, n.title)}
                </span>
                {n.body && <span className="text-muted-foreground line-clamp-2 text-sm">{translateNotificationBody(t, n.body)}</span>}
                <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  {timeFormat.format(new Date(n.created_at))}
                  {showChild && n.student && <Badge variant="outline">{n.student.full_name}</Badge>}
                </span>
              </span>
            </>
          )
          return (
            <li key={n.id}>
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => !n.read_at && void markNotificationsReadAction({ ids: [n.id] })}
                  className={cn("hover:bg-muted/60 flex gap-3 rounded-lg border p-3", !n.read_at && "border-primary/30")}
                >
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => !n.read_at && mark([n.id])} className={cn("hover:bg-muted/60 flex w-full gap-3 rounded-lg border p-3 text-left", !n.read_at && "border-primary/30")}>
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
