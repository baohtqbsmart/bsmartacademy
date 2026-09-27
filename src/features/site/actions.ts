"use server"

import { refresh } from "next/cache"

import {
  articleIdSchema,
  articleSchema,
  heroImageSchema,
  lessonPublicSchema,
  materialPublicSchema,
  teacherWebsiteSchema,
  siteSettingsSchema,
  subjectWebsiteSchema,
  testimonialIdSchema,
  testimonialSchema,
} from "@/features/site/schemas"
import {
  deleteTestimonial,
  saveTestimonial,
  setHeroImage,
  setSubjectWebsite,
  updateSiteSettings,
} from "@/features/site/server/site-service"
import {
  deleteArticle,
  saveArticle,
  setLessonPublic,
  setMaterialPublic,
  setTeacherWebsite,
} from "@/features/site/server/content-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// The public website is edited with site.write (administrators).

export async function saveSiteSettingsAction(input: unknown) {
  return runAction(siteSettingsSchema, input, async (data) => {
    const user = await requirePermission("site.write")
    await updateSiteSettings(await createClient(), user.id, data)
    refresh()
  })
}

export async function setHeroImageAction(input: unknown) {
  return runAction(heroImageSchema, input, async ({ path }) => {
    const user = await requirePermission("site.write")
    await setHeroImage(await createClient(), user.id, path)
    refresh()
  })
}

export async function saveTestimonialAction(input: unknown) {
  return runAction(testimonialSchema, input, async (data) => {
    await requirePermission("site.write")
    await saveTestimonial(await createClient(), data)
    refresh()
  })
}

export async function deleteTestimonialAction(input: unknown) {
  return runAction(testimonialIdSchema, input, async ({ id }) => {
    await requirePermission("site.write")
    await deleteTestimonial(await createClient(), id)
    refresh()
  })
}

export async function saveSubjectWebsiteAction(input: unknown) {
  return runAction(subjectWebsiteSchema, input, async (data) => {
    await requirePermission("site.write")
    await setSubjectWebsite(await createClient(), data)
    refresh()
  })
}

// ---- Public learning content ---------------------------------------------------

export async function setLessonPublicAction(input: unknown) {
  return runAction(lessonPublicSchema, input, async (data) => {
    await requirePermission("site.write")
    await setLessonPublic(await createClient(), data)
    refresh()
  })
}

export async function setMaterialPublicAction(input: unknown) {
  return runAction(materialPublicSchema, input, async (data) => {
    await requirePermission("site.write")
    await setMaterialPublic(await createClient(), data)
    refresh()
  })
}

export async function saveTeacherWebsiteAction(input: unknown) {
  return runAction(teacherWebsiteSchema, input, async (data) => {
    await requirePermission("site.write")
    await setTeacherWebsite(await createClient(), data)
    refresh()
  })
}

export async function saveArticleAction(input: unknown) {
  return runAction(articleSchema, input, async (data) => {
    await requirePermission("site.write")
    const id = await saveArticle(await createClient(), data)
    refresh()
    return id
  })
}

export async function deleteArticleAction(input: unknown) {
  return runAction(articleIdSchema, input, async ({ id }) => {
    await requirePermission("site.write")
    await deleteArticle(await createClient(), id)
    refresh()
  })
}
