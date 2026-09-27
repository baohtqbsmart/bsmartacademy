import { MessageSquareIcon } from "lucide-react"
import Link from "next/link"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { CommentControls, CommentForm } from "@/features/comments/components/comment-form"
import { listComments } from "@/features/comments/server/comment-service"
import { getT } from "@/i18n/server"
import { can } from "@/lib/auth/permissions"
import { getCurrentUser } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

/** Comments under a public lesson or article; signing in lets people join in. */
export async function CommentsSection({ target, returnTo }: { target: { lessonId: string } | { articleId: string }; returnTo: string }) {
  const t = await getT()
  const [user, comments] = await Promise.all([getCurrentUser(), createClient().then((db) => listComments(db, target))])
  const canComment = user ? can(user.permissions, "comments.write") : false
  const canModerate = user ? can(user.permissions, "site.write") : false

  return (
    <section className="grid gap-5" aria-labelledby="comments-title">
      <h2 id="comments-title" className="flex items-center gap-2 text-2xl font-semibold">
        <MessageSquareIcon className="text-primary size-5" aria-hidden />
        {t("Comments ({length})", { length: comments.filter((c) => !c.hidden_at).length })}
      </h2>
      {canComment ? (
        <CommentForm target={target} />
      ) : (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
          <span>{t("Sign in or create a free account to comment.")}</span>
          <span className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`${routes.login}?next=${encodeURIComponent(returnTo)}`}>{t("Sign in")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={routes.register}>{t("Create an account")}</Link>
            </Button>
          </span>
        </div>
      )}
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("No comments yet. Be the first!")}</p>
      ) : (
        <ul className="grid gap-4">
          {comments.map((comment) => (
            <li key={comment.id} className={`flex gap-3 ${comment.hidden_at ? "opacity-60" : ""}`}>
              <UserAvatar name={comment.author_name} avatarUrl={null} className="size-9 shrink-0" />
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{comment.author_name}</span>
                  <span className="text-muted-foreground text-xs">{formatDateTime(comment.created_at)}</span>
                  {comment.hidden_at && <Badge variant="outline">{t("Hidden")}</Badge>}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line">{comment.body}</p>
                {user && (comment.author_id === user.id || canModerate) && (
                  <CommentControls id={comment.id} canDelete canModerate={canModerate} hidden={Boolean(comment.hidden_at)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
