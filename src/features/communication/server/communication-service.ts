import "server-only"

import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

// All queries run as the caller. RLS: notifications and preferences are the
// caller's own; announcements follow their audience; conversations belong to
// their teacher and parent (administrators may read them).

export type NotificationKind = Enums<"notification_kind">

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Creates the caller's time-based reminders (due homework, tuition), then counts unread. */
export async function syncAndCountUnread(db: DbClient) {
  const { error } = await db.rpc("sync_my_notifications")
  if (error) console.error("[notifications] sync failed", error.message)
  const { count, error: countError } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
  if (countError) throw fromPostgrestError(countError)
  return count ?? 0
}

export async function listNotifications(db: DbClient, opts: { unreadOnly: boolean; limit?: number }) {
  let query = db
    .from("notifications")
    .select("id, kind, title, body, link, created_at, read_at, student:students(id, full_name)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.unreadOnly) query = query.is("read_at", null)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export async function markNotificationsRead(db: DbClient, ids: string[] | "all") {
  let query = db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null)
  if (ids !== "all") query = query.in("id", ids)
  const { error } = await query
  if (error) throw fromPostgrestError(error)
}

export async function getPreferences(db: DbClient) {
  const { data, error } = await db.from("notification_preferences").select("kind, enabled")
  if (error) throw fromPostgrestError(error)
  return new Map(data.map((p) => [p.kind, p.enabled]))
}

export async function setPreference(db: DbClient, userId: string, kind: NotificationKind, enabled: boolean) {
  const { error } = await db.from("notification_preferences").upsert({ user_id: userId, kind, enabled })
  if (error) throw fromPostgrestError(error)
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function listAnnouncements(db: DbClient, opts: { limit?: number; includeArchived?: boolean } = {}) {
  let query = db
    .from("announcements")
    .select("id, audience, title, body, pinned, expires_at, created_by, author_name, created_at, archived_at, class:classes(id, name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50)
  if (!opts.includeArchived) query = query.is("archived_at", null)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  const now = Date.now()
  return data.map((a) => ({ ...a, expired: a.expires_at !== null && Date.parse(a.expires_at) <= now }))
}

export type AnnouncementItem = Awaited<ReturnType<typeof listAnnouncements>>[number]

export async function createAnnouncement(
  db: DbClient,
  input: { audience: Enums<"announcement_audience">; classId: string | null; title: string; body: string; pinned: boolean; expiresAt: string | null }
) {
  const { error } = await db.from("announcements").insert({
    audience: input.audience,
    class_id: input.audience === "class" ? input.classId : null,
    title: input.title,
    body: input.body,
    pinned: input.pinned,
    expires_at: input.expiresAt,
  })
  if (error) throw fromPostgrestError(error)
}

export async function archiveAnnouncement(db: DbClient, id: string) {
  const { data, error } = await db.from("announcements").update({ archived_at: new Date().toISOString() }).eq("id", id).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Announcement not found, or you may not change it.")
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Names by profile id, read from the teachers and parents the caller may see (not from profiles). */
async function peopleNames(db: DbClient, profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, string>()
  const [teachers, parents] = await Promise.all([
    db.from("teachers").select("profile_id, full_name").in("profile_id", profileIds),
    db.from("parents").select("profile_id, full_name").in("profile_id", profileIds),
  ])
  const names = new Map<string, string>()
  for (const t of teachers.data ?? []) if (t.profile_id) names.set(t.profile_id, t.full_name)
  for (const p of parents.data ?? []) if (p.profile_id) names.set(p.profile_id, p.full_name)
  return names
}

export async function listThreads(db: DbClient, userId: string) {
  const { data, error } = await db
    .from("message_threads")
    .select("id, student_id, teacher_profile_id, parent_profile_id, created_at, last_message_at, teacher_read_at, parent_read_at, student:students(full_name)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200)
  if (error) throw fromPostgrestError(error)
  const names = await peopleNames(db, [...new Set(data.flatMap((t) => [t.teacher_profile_id, t.parent_profile_id]))])
  return data.map((t) => {
    const role = t.teacher_profile_id === userId ? "teacher" : t.parent_profile_id === userId ? "parent" : "observer"
    const readAt = role === "teacher" ? t.teacher_read_at : role === "parent" ? t.parent_read_at : null
    return {
      ...t,
      role,
      teacherName: names.get(t.teacher_profile_id) ?? "Teacher",
      parentName: names.get(t.parent_profile_id) ?? "Parent",
      unread: role !== "observer" && t.last_message_at !== null && (readAt === null || readAt < t.last_message_at),
    }
  })
}

export async function getThread(db: DbClient, id: string, userId: string) {
  const [thread, messages] = await Promise.all([
    db
      .from("message_threads")
      .select("id, student_id, teacher_profile_id, parent_profile_id, student:students(id, full_name, student_code)")
      .eq("id", id)
      .maybeSingle(),
    db.from("messages").select("id, sender_id, body, created_at").eq("thread_id", id).order("created_at"),
  ])
  if (thread.error) throw fromPostgrestError(thread.error)
  if (messages.error) throw fromPostgrestError(messages.error)
  if (!thread.data) return null
  const t = thread.data
  const names = await peopleNames(db, [t.teacher_profile_id, t.parent_profile_id])
  return {
    ...t,
    participant: userId === t.teacher_profile_id || userId === t.parent_profile_id,
    teacherName: names.get(t.teacher_profile_id) ?? "Teacher",
    parentName: names.get(t.parent_profile_id) ?? "Parent",
    messages: messages.data,
  }
}

/**
 * Who the caller may start a conversation with: a parent sees each child's
 * teachers; a teacher sees each taught student's parents (with accounts).
 * The database re-checks the relationship on every thread and message.
 */
export async function listMessageTargets(db: DbClient, role: "parent" | "teacher") {
  if (role === "parent") {
    const { data, error } = await db
      .from("students")
      .select("id, full_name, enrollments(status, class:classes(name, deleted_at, class_members(teacher:teachers(profile_id, full_name))))")
      .is("deleted_at", null)
      .order("full_name")
    if (error) throw fromPostgrestError(error)
    return data.map((s) => ({
      studentId: s.id,
      studentName: s.full_name,
      people: uniqueBy(
        s.enrollments
          .filter((e) => (e.status === "active" || e.status === "pending") && e.class && !e.class.deleted_at)
          .flatMap((e) => e.class!.class_members.flatMap((m) => (m.teacher?.profile_id ? [{ profileId: m.teacher.profile_id, name: m.teacher.full_name, detail: e.class!.name }] : [])))
      ),
    }))
  }
  const { data, error } = await db
    .from("students")
    .select("id, full_name, student_parents(relationship, parent:parents(profile_id, full_name, deleted_at))")
    .is("deleted_at", null)
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
    .map((s) => ({
      studentId: s.id,
      studentName: s.full_name,
      people: s.student_parents.flatMap((sp) => (sp.parent?.profile_id && !sp.parent.deleted_at ? [{ profileId: sp.parent.profile_id, name: sp.parent.full_name, detail: sp.relationship }] : [])),
    }))
    .filter((s) => s.people.length > 0)
}

function uniqueBy<T extends { profileId: string }>(items: T[]) {
  return [...new Map(items.map((i) => [i.profileId, i])).values()]
}

/** Opens the existing conversation for this child/teacher/parent, or starts one. */
export async function startThread(db: DbClient, input: { studentId: string; teacherProfileId: string; parentProfileId: string }) {
  const { data: existing, error } = await db
    .from("message_threads")
    .select("id")
    .eq("student_id", input.studentId)
    .eq("teacher_profile_id", input.teacherProfileId)
    .eq("parent_profile_id", input.parentProfileId)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (existing) return existing.id
  const { data, error: insertError } = await db
    .from("message_threads")
    .insert({ student_id: input.studentId, teacher_profile_id: input.teacherProfileId, parent_profile_id: input.parentProfileId })
    .select("id")
    .single()
  if (insertError) {
    if (insertError.code === "42501") throw new AppError("FORBIDDEN", "You can only write to the teachers of your child, or the parents of students you teach.")
    throw fromPostgrestError(insertError)
  }
  return data.id
}

export async function sendMessage(db: DbClient, threadId: string, body: string) {
  const { error } = await db.from("messages").insert({ thread_id: threadId, body })
  if (error) {
    if (error.code === "42501") throw new AppError("FORBIDDEN", "This conversation is closed: the teacher no longer teaches this child.")
    throw fromPostgrestError(error)
  }
}

export async function markThreadRead(db: DbClient, threadId: string) {
  const { error } = await db.rpc("mark_thread_read", { target_thread: threadId })
  if (error) throw fromPostgrestError(error)
}
