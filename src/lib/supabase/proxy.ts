import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getPublicEnv } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * Refreshes the auth session cookies and returns the verified user id (or null).
 * The returned response carries any refreshed cookies and must be the one sent
 * back (or have its cookies copied onto a redirect).
 */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and getClaims: it validates
  // the JWT and triggers the token refresh that keeps users signed in.
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub ?? null

  return { response, userId }
}
