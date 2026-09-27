import { z } from "zod"

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them
// into the client bundle; do not access them through a dynamic key.
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

let cached: PublicEnv | undefined

/**
 * Validated public environment. Parsed lazily so `next build` succeeds without
 * secrets; the first request fails loudly if configuration is missing.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached

  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })

  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
    throw new Error(
      `Invalid or missing environment variables: ${keys}. Copy .env.example to .env.local and fill in your Supabase project values.`
    )
  }

  cached = result.data
  return cached
}
