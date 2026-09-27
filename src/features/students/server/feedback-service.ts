import "server-only"

import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

export async function listFeedback(db: DbClient, studentId: string) {
  const { data, error } = await db
    .from("student_feedback")
    .select("id, author_profile_id, author_name, body, created_at")
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data
}

/** The author is set by the database from the session, never from input. */
export async function addFeedback(db: DbClient, studentId: string, body: string) {
  const { error } = await db.from("student_feedback").insert({ student_id: studentId, body })
  if (error) throw fromPostgrestError(error)
}

export async function archiveFeedback(db: DbClient, feedbackId: string) {
  const { data, error } = await db
    .from("student_feedback")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", feedbackId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("FORBIDDEN", "You can only remove feedback you are allowed to edit.")
}
