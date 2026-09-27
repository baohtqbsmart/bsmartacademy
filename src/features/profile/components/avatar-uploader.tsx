"use client"

import { PhotoUploader } from "@/components/shared/photo-uploader"
import { markAvatarUploadedAction } from "@/features/profile/actions"
import { BUCKETS, avatarObjectPath } from "@/lib/storage"

type AvatarUploaderProps = {
  userId: string
  name: string
  avatarUrl: string | null
}

export function AvatarUploader({ userId, name, avatarUrl }: AvatarUploaderProps) {
  return (
    <PhotoUploader
      bucket={BUCKETS.avatars}
      objectPath={avatarObjectPath(userId)}
      name={name}
      photoUrl={avatarUrl}
      onUploaded={markAvatarUploadedAction}
    />
  )
}
