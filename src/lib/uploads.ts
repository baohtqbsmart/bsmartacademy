/**
 * Accepted assignment files. Mirrors public.upload_file_types and the
 * "assignment-files" bucket (tests/db/assignments.test.ts fails if they drift).
 *
 * Validation happens in layers:
 *   1. the browser (extension, type, size) for quick feedback;
 *   2. Storage: bucket size/type limits and RLS on the folder and extension;
 *   3. the server, which reads the uploaded bytes and checks their signature
 *      (sniffFileType) before recording the file;
 *   4. the database, which re-checks type/extension/size/folder against the
 *      stored object when the file row is written.
 */
export const UPLOAD_RULES = {
  maxBytes: 20 * 1024 * 1024,
  maxFilesPerSubmission: 5,
  maxAttachmentsPerAssignment: 10,
  types: {
    "application/pdf": { extensions: ["pdf"], label: "PDF" },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: ["docx"], label: "Word document" },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: ["pptx"], label: "PowerPoint" },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: ["xlsx"], label: "Excel workbook" },
    "text/plain": { extensions: ["txt"], label: "Text file" },
    "image/png": { extensions: ["png"], label: "PNG image" },
    "image/jpeg": { extensions: ["jpg", "jpeg"], label: "JPEG image" },
    "image/webp": { extensions: ["webp"], label: "WebP image" },
    "audio/mpeg": { extensions: ["mp3"], label: "MP3 audio" },
    "audio/mp4": { extensions: ["m4a"], label: "M4A audio" },
    "audio/wav": { extensions: ["wav"], label: "WAV audio" },
    "audio/webm": { extensions: ["webm"], label: "WebM recording" },
    "video/mp4": { extensions: ["mp4"], label: "MP4 video" },
    "video/quicktime": { extensions: ["mov"], label: "QuickTime video" },
  },
} as const

export type UploadMimeType = keyof typeof UPLOAD_RULES.types

export const ACCEPT_ATTRIBUTE = Object.values(UPLOAD_RULES.types)
  .flatMap((t) => t.extensions.map((e) => `.${e}`))
  .join(",")

export function fileExtension(name: string) {
  return /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? null
}

/** The accepted type for a file name, decided by its extension (browsers report types inconsistently). */
export function mimeTypeForName(name: string): UploadMimeType | null {
  const ext = fileExtension(name)
  if (!ext) return null
  for (const [mime, type] of Object.entries(UPLOAD_RULES.types)) {
    if ((type.extensions as readonly string[]).includes(ext)) return mime as UploadMimeType
  }
  return null
}

export function isUploadMimeType(value: string): value is UploadMimeType {
  return value in UPLOAD_RULES.types
}

/** File names are shown to people, never used as paths: keep them short and printable. */
export function cleanFileName(name: string) {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/\p{Cc}]/gu, "_")
    .trim()
  if (cleaned.length <= 200) return cleaned
  const ext = fileExtension(cleaned)
  return ext ? `${cleaned.slice(0, 195 - ext.length)}….${ext}` : cleaned.slice(0, 200)
}

export type UploadCheck = { ok: true; mimeType: UploadMimeType } | { ok: false; message: string }

/** First-line checks on a chosen file (name, size); the browser runs these before uploading. */
export function checkFile(file: { name: string; size: number }): UploadCheck {
  const mimeType = mimeTypeForName(file.name)
  if (!mimeType) {
    return { ok: false, message: `"${file.name}" is not an accepted file type (${describeAcceptedTypes()}).` }
  }
  if (file.size === 0) return { ok: false, message: `"${file.name}" is empty.` }
  if (file.size > UPLOAD_RULES.maxBytes) return { ok: false, message: `"${file.name}" is larger than 20 MB.` }
  return { ok: true, mimeType }
}

export function describeAcceptedTypes() {
  return "PDF, Word, PowerPoint, Excel, text, images, audio or video (MP4, MOV)"
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Content sniffing: the file's first bytes must match its declared type, so a
// renamed executable or script is refused even with an accepted extension.
// ---------------------------------------------------------------------------

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OOXML_PART: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word/",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ppt/",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xl/",
}

function containsAscii(bytes: Uint8Array, text: string) {
  const needle = ascii(text)
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

function isPlainText(bytes: Uint8Array) {
  if (bytes.includes(0)) return false
  try {
    // stream: a character cut off at the end of a partial read is not an error.
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true })
    return true
  } catch {
    return false
  }
}

/** True when `bytes` (the whole file, or at least its first few KB) look like `mimeType`. */
export function matchesSignature(bytes: Uint8Array, mimeType: UploadMimeType): boolean {
  switch (mimeType) {
    case "application/pdf":
      return startsWith(bytes, ascii("%PDF-"))
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // Office files are ZIP archives containing a folder named after the app.
      return startsWith(bytes, ZIP) && containsAscii(bytes, OOXML_PART[mimeType])
    case "text/plain":
      return isPlainText(bytes)
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case "image/webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)
    case "audio/mpeg":
      // ID3 tag, or an MPEG audio frame sync.
      return startsWith(bytes, ascii("ID3")) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    case "audio/wav":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WAVE"), 8)
    case "audio/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    case "audio/mp4":
    case "video/mp4":
    case "video/quicktime":
      return startsWith(bytes, ascii("ftyp"), 4)
  }
}
