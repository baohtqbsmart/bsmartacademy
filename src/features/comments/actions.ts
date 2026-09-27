"use server"

import { refresh } from "next/cache"

import { commentIdSchema, hideCommentSchema, postCommentSchema } from "@/features/comments/schemas"
import { deleteComment, postComment, setCommentHidden } from "@/features/comments/server/comment-service"
import { runAction } from "@/lib/action"
import { requirePermission, requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function postCommentAction(input: unknown) {
  return runAction(postCommentSchema, input, async ({ target, body }) => {
    await requirePermission("comments.write")
    await postComment(await createClient(), target, body)
    refresh()
  })
}

/** Authors remove their own comments; moderators any (RLS decides). */
export async function deleteCommentAction(input: unknown) {
  return runAction(commentIdSchema, input, async ({ id }) => {
    await requireUser()
    await deleteComment(await createClient(), id)
    refresh()
  })
}

export async function hideCommentAction(input: unknown) {
  return runAction(hideCommentSchema, input, async ({ id, hidden }) => {
    await requirePermission("site.write")
    await setCommentHidden(await createClient(), id, hidden)
    refresh()
  })
}
