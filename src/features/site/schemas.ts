import { z } from "zod"

import { SUBJECT_ICONS } from "@/components/brand/subject-art"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)

const optionalHttps = z
  .string()
  .trim()
  .max(300, "Use at most 300 characters.")
  .refine((value) => value === "" || /^https:\/\/\S+$/.test(value), "Enter a link starting with https://")
  .transform((value) => value || null)

export const siteSettingsSchema = z.object({
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address.")
    .transform((value) => value || null),
  contactPhone: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9 +().-]{6,20}$/.test(value), "Enter a valid phone number.")
    .transform((value) => value || null),
  address: optionalText(300),
  facebookUrl: optionalHttps,
  zaloUrl: optionalHttps,
})
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>

/** Object paths inside the public site-media bucket. */
const mediaPath = z
  .string()
  .regex(/^(hero|subjects)\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/, "The uploaded file was not found.")

export const heroImageSchema = z.object({ path: mediaPath.nullable() })

export const testimonialSchema = z.object({
  id: z.uuid().optional(),
  authorName: z.string().trim().min(1, "Enter a name.").max(120, "Use at most 120 characters."),
  authorRole: z.string().trim().max(120, "Use at most 120 characters."),
  quote: z.string().trim().min(1, "Write the testimonial.").max(1000, "Use at most 1000 characters."),
  isPublished: z.boolean(),
  sortOrder: z.coerce.number().int("Order must be a whole number.").min(0).max(999),
})
export type TestimonialInput = z.input<typeof testimonialSchema>

export const testimonialIdSchema = z.object({ id: z.uuid() })

export const subjectWebsiteSchema = z.object({
  subjectId: z.uuid(),
  audience: z.string().trim().max(80, "Use at most 80 characters."),
  icon: z.enum(SUBJECT_ICONS),
  imagePath: mediaPath.nullable(),
  showOnWebsite: z.boolean(),
})
export type SubjectWebsiteInput = z.input<typeof subjectWebsiteSchema>
