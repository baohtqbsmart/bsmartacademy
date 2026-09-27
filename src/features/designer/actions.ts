"use server"

import { redirect } from "next/navigation"

import { designPath, routes } from "@/config/routes"
import { assetIdSchema, assetSchema, createDesignSchema, designIdSchema, saveDesignSchema, sharingSchema } from "@/features/designer/schemas"
import { createDesign, deleteDesign, recordAsset, removeAsset, saveDesign, setSharing } from "@/features/designer/server/design-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks the permission; the database checks ownership,
// validates the content and keeps sharing tokens out of clients' hands.

export async function createDesignAction(input: unknown) {
  return runAction(createDesignSchema, input, async (data) => {
    await requirePermission("designs.write")
    const id = await createDesign(await createClient(), data)
    redirect(designPath(id))
  })
}

/** Returns the new version number. */
export async function saveDesignAction(input: unknown) {
  return runAction(saveDesignSchema, input, async (data) => {
    await requirePermission("designs.write")
    return saveDesign(await createClient(), data)
  })
}

export async function deleteDesignAction(input: unknown) {
  return runAction(designIdSchema, input, async ({ designId }) => {
    await requirePermission("designs.write")
    await deleteDesign(await createClient(), designId)
    redirect(routes.designs)
  })
}

export async function recordAssetAction(input: unknown) {
  return runAction(assetSchema, input, async (data) => {
    await requirePermission("designs.write")
    return recordAsset(await createClient(), data)
  })
}

export async function removeAssetAction(input: unknown) {
  return runAction(assetIdSchema, input, async ({ assetId }) => {
    await requirePermission("designs.write")
    await removeAsset(await createClient(), assetId)
  })
}

/** Returns the share token (null when sharing is off). */
export async function sharingAction(input: unknown) {
  return runAction(sharingSchema, input, async ({ designId, mode }) => {
    await requirePermission("designs.write")
    return setSharing(await createClient(), designId, mode)
  })
}
