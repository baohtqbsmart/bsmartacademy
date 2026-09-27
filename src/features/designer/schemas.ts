import { z } from "zod"

import { contentSchema, DESIGN_KINDS, PAGE_SIZE_IDS, type PageSizeId } from "@/features/designer/model"
import { requiredText } from "@/lib/validation"

export const createDesignSchema = z.object({
  title: requiredText(200, "Give the design a title."),
  kind: z.enum(DESIGN_KINDS),
  templateKey: z.string().regex(/^[a-z0-9-]{1,60}$/).nullable(),
  pageSize: z.enum(PAGE_SIZE_IDS as [PageSizeId, ...PageSizeId[]]),
})

export const saveDesignSchema = z.object({
  designId: z.uuid(),
  /** The version the editor started from; a newer one in the database is a conflict. */
  version: z.int().min(1),
  title: requiredText(200, "Give the design a title."),
  kind: z.enum(DESIGN_KINDS),
  content: contentSchema,
})

export const designIdSchema = z.object({ designId: z.uuid() })

export const assetSchema = z.object({
  designId: z.uuid(),
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(255),
})

export const assetIdSchema = z.object({ assetId: z.uuid() })

export const sharingSchema = z.object({ designId: z.uuid(), mode: z.enum(["on", "off", "reset"]) })
