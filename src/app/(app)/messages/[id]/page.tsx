import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { MarkThreadRead, MessageComposer } from "@/features/communication/components/message-controls"
import { getThread } from "@/features/communication/server/communication-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Conversation" }

export default async function ThreadPage({ params }: PageProps<"/messages/[id]">) {
  const user = await requireRouteAccess(routes.messageThread)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  // RLS: participants and administrators only; everyone else gets 404.
  const thread = await getThread(await createClient(), id, user.id)
  if (!thread) notFound()
  const nameOf = (sender: string | null) => (sender === thread.teacher_profile_id ? thread.teacherName : sender === thread.parent_profile_id ? thread.parentName : "Former participant")

  return (
    <>
      <Link href={routes.messages} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> Messages
      </Link>
      <PageHeader title={`${thread.teacherName} ↔ ${thread.parentName}`} description={`About ${thread.student?.full_name ?? "a student"}`} />
      {thread.participant && <MarkThreadRead threadId={thread.id} />}
      <div className="grid max-w-3xl gap-4">
        <ol className="grid gap-3" aria-label="Messages">
          {thread.messages.length === 0 && <li className="text-muted-foreground text-sm">No messages yet.</li>}
          {thread.messages.map((m) => {
            const mine = m.sender_id === user.id
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <Card className={cn("max-w-[85%] gap-1 py-3", mine && "bg-primary/5 border-primary/30")}>
                  <CardContent className="grid gap-1 px-4">
                    <span className="text-muted-foreground text-xs">
                      {mine ? "You" : nameOf(m.sender_id)} · {formatDateTime(m.created_at)}
                    </span>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ol>
        {thread.participant ? (
          <MessageComposer threadId={thread.id} />
        ) : (
          <p className="text-muted-foreground text-sm">Read-only: you are not a participant in this conversation.</p>
        )}
      </div>
    </>
  )
}
