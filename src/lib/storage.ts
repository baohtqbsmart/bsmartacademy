import type { DbClient } from "@/lib/supabase/types"

/**
 * Storage buckets. All buckets are private; files are served through
 * short-lived signed URLs, and access is enforced by storage.objects RLS.
 * Object paths always start with an owning id ("<owner_id>/...") so policies
 * can authorize by folder.
 */
export const BUCKETS = {
  avatars: "avatars",
  studentPhotos: "student-photos",
  assignmentFiles: "assignment-files",
} as const

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS]

/** Limits shared by the image buckets (mirrors their SQL configuration). */
export const IMAGE_RULES = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const

export function avatarObjectPath(userId: string) {
  return `${userId}/avatar`
}

export function studentPhotoPath(studentId: string) {
  return `${studentId}/photo`
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function createSignedUrl(
  db: DbClient,
  bucket: Bucket,
  path: string | null,
  /** Serve as a download with this file name instead of opening inline. */
  downloadAs?: string
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, downloadAs ? { download: downloadAs } : undefined)
  if (error) {
    console.error("[storage] could not sign url", bucket, error.message)
    return null
  }
  return data.signedUrl
}
