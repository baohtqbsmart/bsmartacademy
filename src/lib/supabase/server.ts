import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getPublicEnv } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request; never share across requests.
 */
export async function createClient() {
  // cookies() first: it marks the route as dynamic before any config is read.
  const cookieStore = await cookies()
  const env = getPublicEnv()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: src/proxy.ts refreshes the session on every request.
          }
        },
      },
    }
  )
}
