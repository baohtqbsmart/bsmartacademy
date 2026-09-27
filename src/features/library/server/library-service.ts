import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import { isLibraryMime, PAGE_SIZE, SORTS, type FileKind, type LibraryView, type SortKey } from "@/features/library/catalog"
import type { createMaterialSchema, folderSchema, updateMaterialSchema } from "@/features/library/schemas"
import type { AssignmentSkill } from "@/features/assignments/status"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"

// Every query runs as the caller; RLS decides which materials, shares and
// folders exist for them (students: only what is assigned or shared).

const PREVIEW_TTL_SECONDS = 60 * 60
const DOWNLOAD_TTL_SECONDS = 5 * 60

export type MaterialFilters = {
  view: LibraryView
  userId: string
  q?: string
  subjectId?: string
  levelId?: string
  skill?: AssignmentSkill
  kind?: FileKind
  folderId?: string | "root"
  sort: SortKey
  page: number
}

const LIST_COLUMNS = `id, scope, owner_id, owner_name, title, description, topic, tags, visibility, file_kind, file_name, size_bytes, archived_at, created_at, folder_id,
  subject:subjects(id, name), level:levels(id, name), skill, library_favorites(user_id)`

export async function listMaterials(db: DbClient, f: MaterialFilters) {
  const sort = SORTS[f.sort]
  let query = db
    .from("library_materials")
    .select(LIST_COLUMNS, { count: "exact" })
    .order(sort.column, { ascending: sort.ascending })
    .order("id")
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1)

  query = f.view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null)
  if (f.view === "mine") query = query.eq("owner_id", f.userId).eq("scope", "personal")
  if (f.view === "academy") query = query.eq("scope", "academy")
  if (f.view === "favorites") {
    const { data: favs, error: favError } = await db.from("library_favorites").select("material_id").eq("user_id", f.userId)
    if (favError) throw fromPostgrestError(favError)
    query = query.in("id", favs.length ? favs.map((x) => x.material_id) : ["00000000-0000-0000-0000-000000000000"])
  }
  // RLS already limits students to what is assigned to them; for staff this
  // view shows what reached them through their classes, not their own uploads.
  if (f.view === "assigned") query = query.neq("owner_id", f.userId)
  if (f.q) {
    const term = f.q.replace(/[%_\\,()"{}]/g, " ").trim()
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,topic.ilike.%${term}%,tags.cs.{"${term.toLowerCase()}"}`)
  }
  if (f.subjectId) query = query.eq("subject_id", f.subjectId)
  if (f.levelId) query = query.eq("level_id", f.levelId)
  if (f.skill) query = query.eq("skill", f.skill)
  if (f.kind) query = query.eq("file_kind", f.kind)
  if (f.folderId === "root") query = query.is("folder_id", null)
  else if (f.folderId) query = query.eq("folder_id", f.folderId)

  const { data, error, count } = await query
  if (error) throw fromPostgrestError(error)
  return {
    total: count ?? 0,
    materials: data.map((m) => ({ ...m, favorite: m.library_favorites.some((fav) => fav.user_id === f.userId) })),
  }
}

export type MaterialListItem = Awaited<ReturnType<typeof listMaterials>>["materials"][number]

export async function getMaterial(db: DbClient, id: string, userId: string) {
  const [material, classes, students] = await Promise.all([
    db
      .from("library_materials")
      .select(
        `id, scope, owner_id, owner_name, title, description, topic, tags, visibility, file_kind, file_name, mime_type, size_bytes, object_path,
         archived_at, created_at, updated_at, folder_id, subject_id, level_id, skill,
         subject:subjects(id, name), level:levels(id, name), folder:library_folders(id, name), library_favorites(user_id)`
      )
      .eq("id", id)
      .maybeSingle(),
    db.from("library_material_classes").select("class_id, shared_by_name, created_at, class:classes(id, name)").eq("material_id", id),
    db.from("library_material_students").select("student_id, shared_by_name, created_at, student:students(id, full_name, student_code)").eq("material_id", id),
  ])
  for (const r of [material, classes, students]) if (r.error) throw fromPostgrestError(r.error)
  if (!material.data) return null
  const m = material.data
  const { data: signed } = await db.storage.from(BUCKETS.assignmentFiles).createSignedUrl(m.object_path, PREVIEW_TTL_SECONDS)
  return {
    ...m,
    favorite: m.library_favorites.some((fav) => fav.user_id === userId),
    previewUrl: signed?.signedUrl ?? null,
    classes: classes.data ?? [],
    students: students.data ?? [],
  }
}

export type MaterialDetail = NonNullable<Awaited<ReturnType<typeof getMaterial>>>

/** A short-lived link that downloads the file under its original name. RLS decides whether it can be made. */
export async function downloadUrl(db: DbClient, id: string) {
  const { data, error } = await db.from("library_materials").select("object_path, file_name").eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new AppError("NOT_FOUND", "Material not found.")
  const { data: signed, error: signError } = await db.storage
    .from(BUCKETS.assignmentFiles)
    .createSignedUrl(data.object_path, DOWNLOAD_TTL_SECONDS, { download: data.file_name })
  if (signError || !signed) throw new AppError("NOT_FOUND", "The file is not available.")
  return signed.signedUrl
}

export async function createMaterial(db: DbClient, input: z.output<typeof createMaterialSchema>) {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  if (!isLibraryMime(file.mimeType)) {
    await discardUpload(db, input.objectPath)
    throw new AppError("VALIDATION", "The library accepts PDF, Word, PowerPoint, images, audio and video.")
  }
  const { data, error } = await db
    .from("library_materials")
    .insert({
      scope: input.scope,
      folder_id: input.folderId,
      title: input.title,
      description: input.description,
      subject_id: input.subjectId,
      level_id: input.levelId,
      skill: input.skill,
      topic: input.topic,
      tags: input.tags,
      visibility: input.visibility,
      object_path: input.objectPath,
      file_name: file.fileName,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
    })
    .select("id")
    .single()
  if (error) {
    await discardUpload(db, input.objectPath)
    throw fromPostgrestError(error)
  }
  return data.id
}

export async function updateMaterial(db: DbClient, input: z.output<typeof updateMaterialSchema>) {
  const { data, error } = await db
    .from("library_materials")
    .update({
      folder_id: input.folderId,
      title: input.title,
      description: input.description,
      subject_id: input.subjectId,
      level_id: input.levelId,
      skill: input.skill,
      topic: input.topic,
      tags: input.tags,
      visibility: input.visibility,
    })
    .eq("id", input.materialId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Material not found, or you may not change it.")
}

async function updateOne(db: DbClient, id: string, patch: { archived_at?: string | null; visibility?: "private" | "staff"; folder_id?: string | null }) {
  const { data, error } = await db.from("library_materials").update(patch).eq("id", id).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Material not found, or you may not change it.")
}

export const setArchived = (db: DbClient, id: string, archived: boolean) => updateOne(db, id, { archived_at: archived ? new Date().toISOString() : null })
export const setVisibility = (db: DbClient, id: string, visibility: "private" | "staff") => updateOne(db, id, { visibility })
export const moveMaterial = (db: DbClient, id: string, folderId: string | null) => updateOne(db, id, { folder_id: folderId })

export async function deleteMaterial(db: DbClient, id: string) {
  const { data, error } = await db.from("library_materials").select("object_path").eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw new AppError("NOT_FOUND", "Material not found.")
  // The file first: the storage policy needs the record to decide.
  const { error: removeError } = await db.storage.from(BUCKETS.assignmentFiles).remove([data.object_path])
  if (removeError) console.error("[library] could not remove file", removeError.message)
  const { data: deleted, error: deleteError } = await db.from("library_materials").delete().eq("id", id).select("id")
  if (deleteError) throw fromPostgrestError(deleteError)
  if (deleted.length === 0) throw new AppError("NOT_FOUND", "Material not found, or you may not delete it.")
}

export async function setFavorite(db: DbClient, userId: string, materialId: string, favorite: boolean) {
  const { error } = favorite
    ? await db.from("library_favorites").upsert({ user_id: userId, material_id: materialId })
    : await db.from("library_favorites").delete().eq("user_id", userId).eq("material_id", materialId)
  if (error) throw fromPostgrestError(error)
}

export async function setClassShare(db: DbClient, materialId: string, classId: string, shared: boolean) {
  const { error } = shared
    ? await db.from("library_material_classes").upsert({ material_id: materialId, class_id: classId }, { ignoreDuplicates: true })
    : await db.from("library_material_classes").delete().eq("material_id", materialId).eq("class_id", classId)
  if (error) throw fromPostgrestError(error)
}

export async function setStudentShare(db: DbClient, materialId: string, studentId: string, shared: boolean) {
  const { error } = shared
    ? await db.from("library_material_students").upsert({ material_id: materialId, student_id: studentId }, { ignoreDuplicates: true })
    : await db.from("library_material_students").delete().eq("material_id", materialId).eq("student_id", studentId)
  if (error) throw fromPostgrestError(error)
}

// ---------------------------------------------------------------------------
// Folders and pick lists
// ---------------------------------------------------------------------------

export async function listFolders(db: DbClient) {
  const { data, error } = await db.from("library_folders").select("id, scope, owner_id, parent_id, name").order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

export type FolderRow = Awaited<ReturnType<typeof listFolders>>[number]

export async function saveFolder(db: DbClient, input: z.output<typeof folderSchema>) {
  if (input.folderId) {
    const { data, error } = await db.from("library_folders").update({ name: input.name, parent_id: input.parentId }).eq("id", input.folderId).select("id")
    if (error) throw fromPostgrestError(error)
    if (data.length === 0) throw new AppError("NOT_FOUND", "Folder not found, or you may not change it.")
    return input.folderId
  }
  const { data, error } = await db.from("library_folders").insert({ scope: input.scope, parent_id: input.parentId, name: input.name }).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function deleteFolder(db: DbClient, folderId: string) {
  const { data, error } = await db.from("library_folders").delete().eq("id", folderId).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Folder not found, or you may not delete it.")
}

export async function listCatalogOptions(db: DbClient) {
  const [subjects, levels] = await Promise.all([
    db.from("subjects").select("id, name").is("deleted_at", null).order("name"),
    db.from("levels").select("id, name, subject_id, sort_order").is("deleted_at", null).order("sort_order"),
  ])
  if (subjects.error) throw fromPostgrestError(subjects.error)
  if (levels.error) throw fromPostgrestError(levels.error)
  return { subjects: subjects.data, levels: levels.data }
}

/** Classes the caller may assign to (admins: all; teachers: those they teach), with current students for direct sharing. */
export async function listShareTargets(db: DbClient, opts: { all: boolean; teacherProfileId: string }) {
  const { data, error } = await db
    .from("classes")
    .select("id, name, status, class_members(teacher:teachers(profile_id)), enrollments(status, student:students(id, full_name, student_code, deleted_at))")
    .is("deleted_at", null)
    .in("status", ["planned", "active"])
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
    .filter((c) => opts.all || c.class_members.some((m) => m.teacher?.profile_id === opts.teacherProfileId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      students: c.enrollments
        .filter((e) => e.status !== "withdrawn" && e.student && !e.student.deleted_at)
        .map((e) => ({ id: e.student!.id, name: e.student!.full_name, code: e.student!.student_code })),
    }))
}

/** Materials assigned to the student's classes or shared with the student (as the caller may see them). */
export async function listStudentMaterials(db: DbClient, studentId: string) {
  const [enrollments, direct] = await Promise.all([
    db.from("enrollments").select("class_id").eq("student_id", studentId).neq("status", "withdrawn"),
    db.from("library_material_students").select("material_id").eq("student_id", studentId),
  ])
  if (enrollments.error) throw fromPostgrestError(enrollments.error)
  if (direct.error) throw fromPostgrestError(direct.error)
  const classIds = enrollments.data.map((e) => e.class_id)
  const viaClass = classIds.length ? await db.from("library_material_classes").select("material_id").in("class_id", classIds) : { data: [], error: null }
  if (viaClass.error) throw fromPostgrestError(viaClass.error)
  const ids = [...new Set([...direct.data, ...(viaClass.data ?? [])].map((r) => r.material_id))]
  if (ids.length === 0) return []
  const { data, error } = await db
    .from("library_materials")
    .select("id, title, file_kind, size_bytes, created_at, owner_name, scope")
    .in("id", ids)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data
}