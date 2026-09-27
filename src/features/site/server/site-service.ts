import "server-only"

import type { z } from "zod"

import type { siteSettingsSchema, subjectWebsiteSchema, testimonialSchema } from "@/features/site/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// ---- Public reads (work without a session) ---------------------------------

export async function getSiteSettings(db: DbClient) {
  const { data, error } = await db
    .from("site_settings")
    .select("contact_email, contact_phone, address, facebook_url, zalo_url, hero_image_path, updated_at")
    .maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export type SiteSettings = NonNullable<Awaited<ReturnType<typeof getSiteSettings>>>

export async function listWebsiteSubjects(db: DbClient) {
  const { data, error } = await db.rpc("website_subjects")
  if (error) throw fromPostgrestError(error)
  return data
}

export type WebsiteSubject = Awaited<ReturnType<typeof listWebsiteSubjects>>[number]

export async function listWebsiteCourses(db: DbClient) {
  const { data, error } = await db.rpc("website_courses")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listPublishedTestimonials(db: DbClient) {
  const { data, error } = await db
    .from("testimonials")
    .select("id, author_name, author_role, quote")
    .eq("is_published", true)
    .order("sort_order")
    .order("created_at")
  if (error) throw fromPostgrestError(error)
  return data
}

// ---- Administration (site.write; RLS enforces it again) ---------------------

export async function listTestimonials(db: DbClient) {
  const { data, error } = await db
    .from("testimonials")
    .select("id, author_name, author_role, quote, is_published, sort_order, updated_at")
    .order("sort_order")
    .order("created_at")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function listSubjectsForWebsite(db: DbClient) {
  const { data, error } = await db
    .from("subjects")
    .select("id, code, name, audience, icon, image_path, show_on_website")
    .is("deleted_at", null)
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data
}

export async function updateSiteSettings(db: DbClient, userId: string, input: z.output<typeof siteSettingsSchema>) {
  const { error, count } = await db
    .from("site_settings")
    .update(
      {
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        address: input.address,
        facebook_url: input.facebookUrl,
        zalo_url: input.zaloUrl,
        updated_by: userId,
      },
      { count: "exact" }
    )
    .eq("id", true)
  if (error) throw fromPostgrestError(error)
  if (!count) throw new AppError("FORBIDDEN", "You do not have permission to do this.")
}

export async function setHeroImage(db: DbClient, userId: string, path: string | null) {
  const { error, count } = await db
    .from("site_settings")
    .update({ hero_image_path: path, updated_by: userId }, { count: "exact" })
    .eq("id", true)
  if (error) throw fromPostgrestError(error)
  if (!count) throw new AppError("FORBIDDEN", "You do not have permission to do this.")
}

export async function saveTestimonial(db: DbClient, input: z.output<typeof testimonialSchema>) {
  const row = {
    author_name: input.authorName,
    author_role: input.authorRole,
    quote: input.quote,
    is_published: input.isPublished,
    sort_order: input.sortOrder,
  }
  const { error } = input.id
    ? await db.from("testimonials").update(row).eq("id", input.id)
    : await db.from("testimonials").insert(row)
  if (error) throw fromPostgrestError(error)
}

export async function deleteTestimonial(db: DbClient, id: string) {
  const { error } = await db.from("testimonials").delete().eq("id", id)
  if (error) throw fromPostgrestError(error)
}

export async function setSubjectWebsite(db: DbClient, input: z.output<typeof subjectWebsiteSchema>) {
  const { error } = await db.rpc("set_subject_website", {
    target_subject: input.subjectId,
    new_audience: input.audience,
    new_icon: input.icon,
    new_image_path: input.imagePath,
    new_show: input.showOnWebsite,
  })
  if (error) throw fromPostgrestError(error)
}
