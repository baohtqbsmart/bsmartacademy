import { MessagesSquareIcon, ShieldIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { messageThreadPath, routes } from "@/config/routes"
import { NewThreadDialog } from "@/features/communication/components/message-controls"
import { listMessageTargets, listThreads } from "@/features/communication/server/communication-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Messages") }
}

export default async function MessagesPage() {
  const tr = await getT()
  const user = await requireRouteAccess(routes.messages)
  const db = await createClient()
  const role = can(user.permissions, "messages.write", ["children"]) ? "parent" : can(user.permissions, "messages.write", ["assigned"]) ? "teacher" : null
  const [threads, targets] = await Promise.all([listThreads(db, user.id), role ? listMessageTargets(db, role) : Promise.resolve([])])
  const observer = can(user.permissions, "messages.read", ["all"])

  return (
    <>
      <PageHeader
        title={tr("Messages")}
        description={role === "parent" ? tr("Conversations with your children's teachers.") : role === "teacher" ? tr("Conversations with the parents of students you teach.") : tr("Teacher–parent conversations (read-only).")}
        actions={role && <NewThreadDialog role={role} userId={user.id} targets={targets} />}
      />
      <p className="text-muted-foreground -mt-3 flex items-center gap-1.5 text-xs">
        <ShieldIcon className="size-3.5" aria-hidden />
        {tr("Only the teacher and the parent in a conversation can write. Academy administrators can read conversations to keep children safe. A conversation closes when the teacher no longer teaches the child.")}
      </p>
      {threads.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={MessagesSquareIcon} title={tr("No conversations yet")} description={role ? tr("Start one with “New conversation”.") : undefined} />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={messageThreadPath(t.id)} className={cn("hover:bg-muted/60 flex items-center justify-between gap-3 rounded-lg border p-3", t.unread && "border-primary/40")}>
                <span className="grid min-w-0 gap-0.5">
                  <span className={cn("truncate text-sm", t.unread && "font-semibold")}>
                    {t.role === "teacher" ? t.parentName : t.role === "parent" ? t.teacherName : `${t.teacherName} ↔ ${t.parentName}`}
                  </span>
                  <span className="text-muted-foreground text-xs">{tr("About {value}", { value: t.student?.full_name ?? "a student" })}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {t.unread && <Badge>{tr("New")}</Badge>}
                  <span className="text-muted-foreground text-xs">{t.last_message_at ? formatDateTime(t.last_message_at) : tr("No messages")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {observer && !role && <p className="text-muted-foreground text-xs">{tr("You are viewing as an administrator and cannot write in these conversations.")}</p>}
    </>
  )
}
