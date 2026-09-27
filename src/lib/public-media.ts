import { getPublicEnv } from "@/lib/env"

/** The public "site-media" bucket (website pictures): plain URLs, no signing. */
export const SITE_MEDIA_BUCKET = "site-media"

export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${SITE_MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`
}
