import { UPLOAD_RULES, type UploadMimeType } from "@/lib/uploads"

/**
 * Library file types: a subset of the platform's upload types (mirrors
 * private.is_library_file_type(); tests/db/library.test.ts checks the database).
 */
export const LIBRARY_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/quicktime",
] as const satisfies readonly UploadMimeType[]

export function isLibraryMime(mime: string): mime is (typeof LIBRARY_MIME_TYPES)[number] {
  return (LIBRARY_MIME_TYPES as readonly string[]).includes(mime)
}

export const LIBRARY_ACCEPT = LIBRARY_MIME_TYPES.flatMap((m) => UPLOAD_RULES.types[m].extensions.map((e) => `.${e}`)).join(",")

export const FILE_KINDS = ["pdf", "document", "presentation", "image", "audio", "video"] as const
export type FileKind = (typeof FILE_KINDS)[number]
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  document: "Word",
  presentation: "PowerPoint",
  image: "Image",
  audio: "Audio",
  video: "Video",
}

/** What the browser can show inline. Word and PowerPoint are downloaded (no third-party viewer receives the file). */
export function previewMode(kind: string): "pdf" | "image" | "audio" | "video" | null {
  return kind === "pdf" || kind === "image" || kind === "audio" || kind === "video" ? kind : null
}

export const VIEWS = ["all", "mine", "academy", "assigned", "favorites", "archived"] as const
export type LibraryView = (typeof VIEWS)[number]
export const VIEW_LABELS: Record<LibraryView, string> = {
  all: "All I can see",
  mine: "My materials",
  academy: "Academy library",
  assigned: "Assigned to me",
  favorites: "Favourites",
  archived: "Archived",
}

export const SORTS = {
  newest: { label: "Newest first", column: "created_at", ascending: false },
  oldest: { label: "Oldest first", column: "created_at", ascending: true },
  title: { label: "Title A–Z", column: "title", ascending: true },
  largest: { label: "Largest first", column: "size_bytes", ascending: false },
  smallest: { label: "Smallest first", column: "size_bytes", ascending: true },
} as const
export type SortKey = keyof typeof SORTS
export const SORT_KEYS = Object.keys(SORTS) as SortKey[]

export const PAGE_SIZE = 24

/** "phân số, HK1" → ["phân số", "hk1"] (the database normalises again). */
export function parseTags(value: string) {
  return [...new Set(value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
}
