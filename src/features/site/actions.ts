"use server"

import { refresh } from "next/cache"

import {
  heroImageSchema,
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
