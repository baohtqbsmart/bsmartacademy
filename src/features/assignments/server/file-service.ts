import "server-only"

import { AppError } from "@/lib/errors"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import { cleanFileName, matchesSignature, mimeTypeForName, UPLOAD_RULES } from "@/lib/uploads"

// Enough to recognise every accepted format (Office files name their app
// folder in the first ZIP entries).
const SNIFF_BYTES = 256 * 1024

/**
 * Checks an object the browser has just uploaded: its type comes from the
 * extension, and its first bytes must match that type. A file that fails is
 * deleted straight away. Returns what the database row needs.
 */
export async function verifyUpload(db: DbClient, objectPath: string, rawName: string) {
  const fileName = cleanFileName(rawName)
  const mimeType = mimeTypeForName(fileName)
  if (!mimeType) throw new AppError("VALIDATION", "This file type is not accepted.")

  const bucket = db.storage.from(BUCKETS.assignmentFiles)
  // RLS: the download only works for an object the caller may read.
  const { data, error } = await bucket.download(objectPath)
  if (error || !data) throw new AppError("NOT_FOUND", "The uploaded file was not found. Please upload it again.")

  const bytes = new Uint8Array(await data.slice(0, SNIFF_BYTES).arrayBuffer())
  if (!matchesSignature(bytes, mimeType)) {
    await bucket.remove([objectPath])
    throw new AppError("VALIDATION", `"${fileName}" does not look like a real ${UPLOAD_RULES.types[mimeType].label}, so it was not accepted.`)
  }
  return { fileName, mimeType, sizeBytes: data.size }
}

/** Removes an uploaded object whose database row could not be written. */
export async function discardUpload(db: DbClient, objectPath: string) {
  await db.storage.from(BUCKETS.assignmentFiles).remove([objectPath])
}

/** Signed download links for a list of file rows (RLS decides which ones resolve). */
export async function withDownloadLinks<T extends { object_path: string; file_name: string }>(db: DbClient, files: T[]) {
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      url: await createSignedUrl(db, BUCKETS.assignmentFiles, file.object_path, file.file_name),
    }))
  )
}
