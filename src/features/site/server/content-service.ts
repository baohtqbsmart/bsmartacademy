import "server-only"

import type { z } from "zod"

import type { articleSchema, lessonPublicSchema, materialPublicSchema, teacherWebsiteSchema } from "@/features/site/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"

// ---- Public reads (work without a session) -----------------------------------
// Visitors only reach content through the public_* functions, which return
// what each access level allows (see supabase/migrations/20261015000100).

export async function listPublicLessons(db: DbClient) {
  const { data, error } = await db.rpc("public_lessons")
  if (error) throw fromPostgrestError(error)
  return data
}

export type PublicLessonItem = Awaited<ReturnType<typeof listPublicLessons>>[number]

export async function getPublicLesson(db: DbClient, slug: string) {
  const { data, error } = await db.rpc("public_lesson", { target_slug: slug })
  if (error) throw fromPostgrestError(error)
  const lesson = data[0]
  if (!lesson) return null
  // Storage lets visitors sign exactly the media of public lessons.
  const mediaUrl = await createSignedUrl(db, BUCKETS.assignmentFiles, lesson.media_path)
  return { ...lesson, mediaUrl, mediaKind: mediaKind(lesson.media_path) }
}

export type PublicLesson = NonNullable<Awaited<ReturnType<typeof getPublicLesson>>>

export async function listPublicMaterials(db: DbClient) {
  const { data, error } = await db.rpc("public_materials")
  if (error) throw fromPostgrestError(error)
  return data
}

export type PublicMaterialItem = Awaited<ReturnType<typeof listPublicMaterials>>[number]

export async function getPublicMaterial(db: DbClient, id: string) {
  const { data, error } = await db.rpc("public_material", { target_material: id })
  if (error) throw fromPostgrestError(error)
  const material = data[0]
  if (!material) return null
  const fileUrl = await createSignedUrl(db, BUCKETS.assignmentFiles, material.object_path)
  return { ...material, fileUrl }
}

export async function listPublicTeachers(db: DbClient) {
  const { data, error } = await db.rpc("public_teachers")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listPublishedArticles(db: DbClient, limit?: number) {
  let query = db
    .from("articles")
    .select("id, slug, title, excerpt, cover_image_path, published_at, author_name")
    .eq("status", "published")
    .order("published_at", { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type ArticleListItem = Awaited<ReturnType<typeof listPublishedArticles>>[number]

export async function getPublishedArticle(db: DbClient, slug: string) {
  const { data, error } = await db
    .from("articles")
    .select("id, slug, title, excerpt, body, cover_image_path, published_at, updated_at, author_name")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

function mediaKind(path: string | null): "audio" | "video" | "image" | null {
  if (!path) return null
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  if (["mp3", "m4a", "wav", "webm", "ogg"].includes(ext)) return "audio"
  if (["mp4", "mov"].includes(ext)) return "video"
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image"
  return null
}

// ---- Administration (site.write; the database checks it again) ---------------

export async function setLessonPublic(db: DbClient, input: z.output<typeof lessonPublicSchema>) {
  const { error } = await db.rpc("set_lesson_public", { target_lesson: input.lessonId, new_access: input.access, new_slug: input.slug })
  if (error) throw fromPostgrestError(error)
}

export async function setMaterialPublic(db: DbClient, input: z.output<typeof materialPublicSchema>) {
  const { error } = await db.rpc("set_material_public", { target_material: input.materialId, new_access: input.access })
  if (error) throw fromPostgrestError(error)
}

export async function listTeachersForWebsite(db: DbClient) {
  const { data, error } = await db
    .from("teachers")
    .select("id, teacher_code, full_name, status, public_bio, public_photo_path, show_on_website")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("full_name")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function setTeacherWebsite(db: DbClient, input: z.output<typeof teacherWebsiteSchema>) {
  const { error } = await db.rpc("set_teacher_website", {
    target_teacher: input.teacherId,
    new_bio: input.bio,
    new_photo_path: input.photoPath,
    new_show: input.showOnWebsite,
  })
  if (error) throw fromPostgrestError(error)
}

export async function listArticlesForAdmin(db: DbClient) {
  const { data, error } = await db
    .from("articles")
    .select("id, slug, title, status, published_at, updated_at, author_name")
    .order("updated_at", { ascending: false })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function getArticleForEdit(db: DbClient, id: string) {
  const { data, error } = await db
    .from("articles")
    .select("id, slug, title, excerpt, body, cover_image_path, status, published_at")
    .eq("id", id)
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export async function saveArticle(db: DbClient, input: z.output<typeof articleSchema>) {
  const row = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    cover_image_path: input.coverImagePath,
    status: input.status,
  }
  if (input.id) {
    const { error, count } = await db.from("articles").update(row, { count: "exact" }).eq("id", input.id)
    if (error) throw fromPostgrestError(error)
    if (!count) throw new AppError("NOT_FOUND", "Article not found.")
    return input.id
  }
  const { data, error } = await db.from("articles").insert(row).select("id").single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function deleteArticle(db: DbClient, id: string) {
  const { error } = await db.from("articles").delete().eq("id", id)
  if (error) throw fromPostgrestError(error)
}
