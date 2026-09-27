import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

/** Groups of audited actions (the action names come from the audit triggers). */
export const AUDIT_GROUPS = {
  accounts: ["user.role_changed", "user.activated", "user.deactivated", "permission.granted", "permission.revoked"],
  finance: ["payment.recorded", "payment.voided", "invoice.voided"],
  content: ["content.visibility_changed", "article.published", "article.deleted", "website.settings_changed"],
  records: ["student.archived", "student.restored", "teacher.archived", "teacher.restored", "class.archived", "class.restored"],
} as const

export type AuditGroup = keyof typeof AUDIT_GROUPS

/** Latest entries (RLS: audit.read only). */
export async function listAuditLog(db: DbClient, filters: { group?: AuditGroup; limit?: number } = {}) {
  let query = db
    .from("audit_log")
    .select("id, occurred_at, actor_name, action, entity, entity_id, summary, details")
    .order("occurred_at", { ascending: false })
    .limit(filters.limit ?? 200)
  if (filters.group) query = query.in("action", [...AUDIT_GROUPS[filters.group]])
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}
