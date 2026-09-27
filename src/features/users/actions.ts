"use server"

import { refresh } from "next/cache"

import { setUserActiveSchema, setUserRoleSchema, userPermissionSchema } from "@/features/users/schemas"
import { setUserActive, setUserPermission, setUserRole } from "@/features/users/server/user-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function setUserRoleAction(input: unknown) {
  return runAction(setUserRoleSchema, input, async ({ userId, roleCode }) => {
    await requirePermission("users.manage")
    await setUserRole(await createClient(), userId, roleCode)
    refresh()
  })
}

export async function setUserActiveAction(input: unknown) {
  return runAction(setUserActiveSchema, input, async ({ userId, active }) => {
    await requirePermission("users.manage")
    await setUserActive(await createClient(), userId, active)
    refresh()
  })
}

export async function setUserPermissionAction(input: unknown) {
  return runAction(userPermissionSchema, input, async ({ userId, permission, granted }) => {
    await requirePermission("users.manage")
    await setUserPermission(await createClient(), userId, permission, granted)
    refresh()
  })
}
