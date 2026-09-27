import { z } from "zod"

export const setUserRoleSchema = z.object({
  userId: z.uuid(),
  roleCode: z.string().regex(/^[a-z][a-z_]*$/),
})

export const setUserActiveSchema = z.object({
  userId: z.uuid(),
  active: z.boolean(),
})

/** Per-user permission grant (scope "all"); the database enforces who may grant what. */
export const userPermissionSchema = z.object({
  userId: z.uuid(),
  permission: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  granted: z.boolean(),
})
