"use client"

import { recordAssetAction } from "@/features/designer/actions"
import type { AssetInfo } from "@/features/designer/server/design-service"
import { BUCKETS } from "@/lib/storage"
import { createClient } from "@/lib/supabase/client"
import { checkFile, fileExtension, UPLOAD_RULES } from "@/lib/uploads"

export type Media = "image" | "audio" | "video"

const MEDIA_LABELS: Record<Media, string> = { image: "a picture (PNG, JPEG or WebP)", audio: "audio (MP3, M4A, WAV or WebM)", video: "a video (MP4 or MOV)" }

/** File-picker filter for one kind of media. */
export function acceptFor(media: Media) {
  return Object.entries(UPLOAD_RULES.types)
    .filter(([mime]) => mime.startsWith(`${media}/`))
    .flatMap(([, t]) => t.extensions.map((e) => `.${e}`))
    .join(",")
}

/**
 * Uploads straight to Storage (designs/<design>/<random>.<ext>), then the
 * server checks the file's bytes and records it. The database accepts only
 * images, audio and video, in the design's own folder.
 */
export async function uploadDesignFile(designId: string, file: File, media: Media): Promise<AssetInfo> {
  const check = checkFile(file)
  if (!check.ok) throw new Error(check.message)
  if (!check.mimeType.startsWith(`${media}/`)) throw new Error(`"${file.name}" is not ${MEDIA_LABELS[media]}.`)
  const objectPath = `designs/${designId}/${crypto.randomUUID()}.${fileExtension(file.name)}`
  const { error } = await createClient().storage.from(BUCKETS.assignmentFiles).upload(objectPath, file, { contentType: check.mimeType, upsert: false })
  if (error) throw new Error(`"${file.name}" could not be uploaded. Please try again.`)
  const result = await recordAssetAction({ designId, objectPath, fileName: file.name })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
