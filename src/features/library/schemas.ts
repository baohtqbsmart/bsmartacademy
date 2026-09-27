import { z } from "zod"

import { ASSIGNMENT_SKILLS } from "@/features/assignments/status"
import { optionalText, requiredText } from "@/lib/validation"

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null)

const details = {
  title: requiredText(200, "Give the material a title."),
  description: z.string().trim().max(2000),
  subjectId: optionalUuid,
  levelId: optionalUuid,
  skill: z.union([z.enum(ASSIGNMENT_SKILLS), z.literal("")]).transform((v) => v || null),
  topic: optionalText(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(10),
  folderId: optionalUuid,
  visibility: z.enum(["private", "staff"]),
}

export const createMaterialSchema = z.object({
  ...details,
  scope: z.enum(["personal", "academy"]),
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(255),
})

export const updateMaterialSchema = z.object({ ...details, materialId: z.uuid() })

export type MaterialFormValues = z.input<typeof updateMaterialSchema>

export const materialIdSchema = z.object({ materialId: z.uuid() })
export const archiveSchema = z.object({ materialId: z.uuid(), archived: z.boolean() })
export const favoriteSchema = z.object({ materialId: z.uuid(), favorite: z.boolean() })
export const visibilitySchema = z.object({ materialId: z.uuid(), visibility: z.enum(["private", "staff"]) })
export const classShareSchema = z.object({ materialId: z.uuid(), classId: z.uuid(), shared: z.boolean() })
export const studentShareSchema = z.object({ materialId: z.uuid(), studentId: z.uuid(), shared: z.boolean() })

export const folderSchema = z.object({
  folderId: z.uuid().optional(),
  scope: z.enum(["personal", "academy"]),
  parentId: optionalUuid,
  name: requiredText(100, "Name the folder."),
})
export const folderIdSchema = z.object({ folderId: z.uuid() })
export const moveSchema = z.object({ materialId: z.uuid(), folderId: optionalUuid })
