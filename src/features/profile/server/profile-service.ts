import "server-only"

import type { z } from "zod"

import type { profileSchema } from "@/features/profile/schemas"
import { fromPostgrestError } from "@/lib/errors"
import { avatarObjectPath } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"

type ProfileUpdate = z.output<typeof profileSchema>

export async function updateProfile(db: DbClient, userId: string, input: ProfileUpdate) {
  const { error } = await db
    .from("profiles")
    .update({ full_name: input.fullName, phone: input.phone || null })
    .eq("id", userId)
  if (error) throw fromPostgrestError(error)
}

/** Records that the user's avatar object now exists at its canonical path. */
export async function markAvatarUploaded(db: DbClient, userId: string) {
  const { error } = await db
    .from("profiles")
    .update({ avatar_path: avatarObjectPath(userId) })
    .eq("id", userId)
  if (error) throw fromPostgrestError(error)
}
