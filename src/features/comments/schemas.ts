import { z } from "zod"

export const commentTargetSchema = z.union([
  z.object({ lessonId: z.uuid(), articleId: z.undefined().optional() }),
  z.object({ articleId: z.uuid(), lessonId: z.undefined().optional() }),
])

export const postCommentSchema = z.object({
  target: commentTargetSchema,
  body: z.string().trim().min(1, "Write the comment.").max(2000, "Use at most 2000 characters."),
})

export const commentIdSchema = z.object({ id: z.uuid() })
export const hideCommentSchema = z.object({ id: z.uuid(), hidden: z.boolean() })
