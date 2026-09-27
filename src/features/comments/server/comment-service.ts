import "server-only"

import type { z } from "zod"

import type { commentTargetSchema } from "@/features/comments/schemas"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

type Target = z.output<typeof commentTargetSchema>

/** Visible comments of a public page (moderators also get hidden ones, RLS). */
export async function listComments(db: DbClient, target: Target) {
  let query = db
    .from("content_comments")
    .select("id, author_id, author_name, body, hidden_at, created_at")
    .order("created_at", { ascending: true })
    .limit(200)
  query = target.lessonId ? query.eq("lesson_id", target.lessonId) : query.eq("article_id", target.articleId!)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type CommentItem = Awaited<ReturnType<typeof listComments>>[number]

export async function postComment(db: DbClient, target: Target, body: string) {
  const { error } = await db
    .from("content_comments")
    .insert({ lesson_id: target.lessonId ?? null, article_id: target.articleId ?? null, body })
  if (error) throw fromPostgrestError(error)
}

export async function deleteComment(db: DbClient, id: string) {
  const { error } = await db.from("content_comments").delete().eq("id", id)
  if (error) throw fromPostgrestError(error)
}

export async function setCommentHidden(db: DbClient, id: string, hidden: boolean) {
  const { error } = await db
    .from("content_comments")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", id)
  if (error) throw fromPostgrestError(error)
}
