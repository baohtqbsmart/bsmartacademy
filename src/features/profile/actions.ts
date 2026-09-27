"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { profileSchema } from "@/features/profile/schemas"
import { markAvatarUploaded, updateProfile } from "@/features/profile/server/profile-service"
import { runAction } from "@/lib/action"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function updateProfileAction(input: unknown) {
  return runAction(profileSchema, input, async (data) => {
    const user = await requireUser()
    await updateProfile(await createClient(), user.id, data)
    refresh()
  })
}

export async function markAvatarUploadedAction() {
  return runAction(z.undefined(), undefined, async () => {
    const user = await requireUser()
    await markAvatarUploaded(await createClient(), user.id)
    refresh()
  })
}
