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

// ---- Public learning content (phase 2) ----------------------------------------

export const PUBLIC_ACCESS = ["members", "preview", "public"] as const

/** Lower-case words joined by dashes: "english-present-simple". */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Give it a web address.")
  .max(120, "Use at most 120 characters.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, digits and dashes only, e.g. english-present-simple.")

export const lessonPublicSchema = z
  .object({
    lessonId: z.uuid(),
    access: z.enum(PUBLIC_ACCESS),
    slug: z.string().trim().toLowerCase(),
  })
  .transform((value, ctx) => {
    if (value.access === "members" && value.slug === "") return { ...value, slug: null }
    const slug = slugSchema.safeParse(value.slug)
    if (!slug.success) {
      ctx.addIssue({ code: "custom", message: slug.error.issues[0].message, path: ["slug"] })
      return z.NEVER
    }
    return { ...value, slug: slug.data }
  })

export const materialPublicSchema = z.object({ materialId: z.uuid(), access: z.enum(PUBLIC_ACCESS) })

export const teacherWebsiteSchema = z.object({
  teacherId: z.uuid(),
  bio: z.string().trim().max(1000, "Use at most 1000 characters."),
  photoPath: z
    .string()
    .regex(/^teachers\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/, "The uploaded file was not found.")
    .nullable(),
  showOnWebsite: z.boolean(),
})

export const articleSchema = z.object({
  id: z.uuid().optional(),
  slug: slugSchema,
  title: z.string().trim().min(1, "Enter a title.").max(200, "Use at most 200 characters."),
  excerpt: z.string().trim().max(500, "Use at most 500 characters."),
  body: z.string().trim().max(50000, "Use at most 50000 characters."),
  coverImagePath: z
    .string()
    .regex(/^articles\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/, "The uploaded file was not found.")
    .nullable(),
  status: z.enum(["draft", "published"]),
})
export type ArticleInput = z.input<typeof articleSchema>

export const articleIdSchema = z.object({ id: z.uuid() })
