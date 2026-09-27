"use client"

import { EyeIcon, EyeOffIcon, Trash2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { deleteCommentAction, hideCommentAction, postCommentAction } from "@/features/comments/actions"
import { useT } from "@/i18n/client"

type Target = { lessonId: string } | { articleId: string }

export function CommentForm({ target }: { target: Target }) {
  const t = useT()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await postCommentAction({ target, body })
          if (result.ok) {
            setBody("")
            toast.success(t("Comment posted."))
          } else setError(result.error.fieldErrors?.body?.[0] ?? result.error.message)
        })
      }}
    >
      <label htmlFor="comment-body" className="sr-only">
        {t("Your comment")}
      </label>
      <Textarea
        id="comment-body"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("Share a question or what you learnt…")}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Button type="submit" disabled={isPending || !body.trim()}>
          {t("Post comment")}
        </Button>
      </div>
    </form>
  )
}

export function CommentControls({ id, canDelete, canModerate, hidden }: { id: string; canDelete: boolean; canModerate: boolean; hidden: boolean }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const run = (action: () => Promise<{ ok: boolean; error?: { message: string } }>, done: string) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(t(done))
      else toast.error(result.error?.message ?? "")
    })

  return (
    <div className="flex gap-1">
      {canModerate && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => run(() => hideCommentAction({ id, hidden: !hidden }), hidden ? "Comment shown." : "Comment hidden.")}
        >
          {hidden ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />} {hidden ? t("Show") : t("Hide")}
        </Button>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (window.confirm(t("Delete this comment?"))) run(() => deleteCommentAction({ id }), "Comment deleted.")
          }}
        >
          <Trash2Icon aria-hidden /> {t("Delete")}
        </Button>
      )}
    </div>
  )
}
