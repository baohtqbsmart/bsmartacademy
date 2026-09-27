import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

/** Live parents visible to the caller, with the children the caller may see. */
export async function listParents(db: DbClient) {
  const { data, error } = await db
    .from("parents")
    .select(
      "id, full_name, phone, email, student_parents(relationship, student:students(student_code, full_name))"
    )
    .is("deleted_at", null)
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

/** Minimal parent list for the "link parent" picker. */
export async function listParentOptions(db: DbClient) {
  const { data, error } = await db
    .from("parents")
    .select("id, full_name, phone")
    .is("deleted_at", null)
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}
