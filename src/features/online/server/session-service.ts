import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import type { sessionSchema } from "@/features/online/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { getIntegration } from "@/lib/meetings"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"

// Every query runs as the caller. RLS: staff see their classes' sessions,
// hidden materials and teaching notes; students and parents see their
// (children's) classes' sessions and visible materials only.

const LIST_COLUMNS = `id, class_id, title, starts_at, ends_at, session_date, provider, meeting_url, status, recording_url, cancelled_reason,
  class:classes(id, name, code, delivery_mode), teacher:teachers(id, full_name),
  online_session_materials(count), online_session_homework(count)`

export async function listSessions(
  db: DbClient,
  filters: { classId?: string; from?: string; to?: string; latestFirst?: boolean; limit?: number } = {}
) {
  let query = db.from("online_sessions").select(LIST_COLUMNS).order("starts_at", { ascending: !filters.latestFirst })
  if (filters.classId) query = query.eq("class_id", filters.classId)
  if (filters.from) query = query.gte("session_date", filters.from)
  if (filters.to) query = query.lte("session_date", filters.to)
  if (filters.limit) query = query.limit(filters.limit)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map((s) => ({
    ...s,
    materialCount: s.online_session_materials[0]?.count ?? 0,
    homeworkCount: s.online_session_homework[0]?.count ?? 0,
  }))
}

export type SessionListItem = Awaited<ReturnType<typeof listSessions>>[number]

export async function getSession(db: DbClient, id: string) {
  const [session, materials, homework, notes, joins] = await Promise.all([
    db
      .from("online_sessions")
      .select(
        `id, class_id, teacher_id, title, agenda, starts_at, ends_at, session_date, provider, meeting_url, meeting_code, passcode,
         link_source, recording_url, status, started_at, ended_at, cancelled_reason, created_by_name,
         class:classes(id, name, code, delivery_mode, status), teacher:teachers(id, full_name)`
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("online_session_materials")
      .select("id, kind, title, url, object_path, file_name, mime_type, size_bytes, visible_to_students, created_at")
      .eq("session_id", id)
      .order("created_at"),
    db
      .from("online_session_homework")
      .select("assignment:assignments(id, title, assignment_type, status, due_at)")
      .eq("session_id", id),
    // Teaching notes: the class's staff only (RLS returns nothing otherwise).
    db.from("online_session_notes").select("notes, updated_by_name, updated_at").eq("session_id", id).maybeSingle(),
    db
      .from("online_session_joins")
      .select("student_id, first_joined_at, last_joined_at, join_count, student:students(full_name)")
      .eq("session_id", id)
      .order("first_joined_at"),
  ])
  for (const result of [session, materials, homework, notes, joins]) if (result.error) throw fromPostgrestError(result.error)
  if (!session.data) return null
  return {
    ...session.data,
    materials: await Promise.all(
      (materials.data ?? []).map(async (m) => ({
        ...m,
        href: m.kind === "link" ? m.url : await createSignedUrl(db, BUCKETS.assignmentFiles, m.object_path, m.file_name ?? undefined),
      }))
    ),
    homework: (homework.data ?? []).flatMap((h) => (h.assignment ? [h.assignment] : [])),
    notes: notes.data,
    joins: joins.data ?? [],
  }
}

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSession>>>

/** The (non-cancelled) online session a class has on a date, for the register. */
export async function onlineSessionOn(db: DbClient, classId: string, date: string) {
  const { data, error } = await db
    .from("online_sessions")
    .select("id, title, meeting_url")
    .eq("class_id", classId)
    .eq("session_date", date)
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(1)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listOnlineClasses(db: DbClient) {
  const { data, error } = await db
    .from("classes")
    .select("id, name, delivery_mode, meeting_url, class_members(member_role, teacher:teachers(id, full_name, profile_id))")
    .is("deleted_at", null)
    .in("status", ["planned", "active"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    meetingUrl: c.meeting_url,
    teachers: c.class_members.flatMap((m) => (m.teacher ? [{ ...m.teacher, lead: m.member_role === "lead_teacher" }] : [])),
  }))
}

export async function listClassAssignments(db: DbClient, classId: string) {
  const { data, error } = await db
    .from("assignments")
    .select("id, title, status, due_at")
    .eq("class_id", classId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function saveSession(db: DbClient, input: z.output<typeof sessionSchema>) {
  // A connected provider would create the meeting here (link_source 'api');
  // none is configured yet, so the pasted link is used as is.
  void getIntegration(input.provider)
  const row = {
    teacher_id: input.teacherId,
    title: input.title,
    agenda: input.agenda,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    provider: input.provider,
    meeting_url: input.meetingUrl,
    meeting_code: input.meetingCode,
    passcode: input.passcode,
  }
  if (input.sessionId) {
    const { data, error } = await db
      .from("online_sessions")
      .update({ ...row, recording_url: input.recordingUrl })
      .eq("id", input.sessionId)
      .select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("NOT_FOUND", "Session not found.")
    return input.sessionId
  }
  const { data, error } = await db
    .from("online_sessions")
    .insert({ ...row, class_id: input.classId })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function changeSessionStatus(db: DbClient, sessionId: string, action: "start" | "end" | "reopen" | "cancel" | "restore", reason: string | null) {
  const status = ({ start: "live", reopen: "live", end: "ended", cancel: "cancelled", restore: "scheduled" } as const)[action]
  const { data, error } = await db
    .from("online_sessions")
    .update(action === "cancel" ? { status, cancelled_reason: reason } : { status })
    .eq("id", sessionId)
    .select("meeting_url")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Session not found, or you may not change it.")
  return data[0].meeting_url
}

export async function addLinkMaterial(db: DbClient, input: { sessionId: string; title: string; url: string; visible: boolean }) {
  const { error } = await db
    .from("online_session_materials")
    .insert({ session_id: input.sessionId, kind: "link", title: input.title, url: input.url, visible_to_students: input.visible })
  if (error) throw fromPostgrestError(error)
}

export async function addFileMaterial(db: DbClient, input: { sessionId: string; objectPath: string; fileName: string }) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  const { error } = await db.from("online_session_materials").insert({
    session_id: input.sessionId,
    kind: "file",
    title: file.fileName,
    object_path: input.objectPath,
    file_name: file.fileName,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
  })
  if (error) {
    await discardUpload(db, input.objectPath)
    throw fromPostgrestError(error)
  }
}

export async function setMaterialVisibility(db: DbClient, materialId: string, visible: boolean) {
  const { data, error } = await db.from("online_session_materials").update({ visible_to_students: visible }).eq("id", materialId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Material not found.")
}

export async function removeMaterial(db: DbClient, materialId: string) {
  const { data, error } = await db.from("online_session_materials").delete().eq("id", materialId).select("object_path")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Material not found.")
  if (data[0].object_path) await discardUpload(db, data[0].object_path)
}

export async function linkHomework(db: DbClient, sessionId: string, assignmentId: string) {
  const { error } = await db.from("online_session_homework").upsert({ session_id: sessionId, assignment_id: assignmentId })
  if (error) throw fromPostgrestError(error)
}

export async function unlinkHomework(db: DbClient, sessionId: string, assignmentId: string) {
  const { error } = await db.from("online_session_homework").delete().eq("session_id", sessionId).eq("assignment_id", assignmentId)
  if (error) throw fromPostgrestError(error)
}

export async function saveNotes(db: DbClient, sessionId: string, notes: string) {
  const { error } = await db.from("online_session_notes").upsert({ session_id: sessionId, notes })
  if (error) throw fromPostgrestError(error)
}

export async function joinSession(db: DbClient, sessionId: string) {
  const { data, error } = await db.rpc("join_online_session", { target_session_id: sessionId })
  if (error) throw fromPostgrestError(error)
  return data
}
