import { NextResponse, type NextRequest } from "next/server"

import { isPublicRoute, routes } from "@/config/routes"
import { updateSession } from "@/lib/supabase/proxy"

/**
 * Runs before every matched request:
 *  1. refreshes the Supabase session cookies,
 *  2. performs an optimistic auth redirect.
 * Real authorization happens again in the data layer (requireRouteAccess/requirePermission)
 * and in Postgres RLS; this is only the first gate.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  if (!userId && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = routes.login
    url.search = pathname === routes.home ? "" : `?next=${encodeURIComponent(pathname + search)}`
    return redirectWithCookies(url, response)
  }

  if (userId && pathname === routes.login) {
    const url = request.nextUrl.clone()
    url.pathname = routes.dashboard
    url.search = ""
    return redirectWithCookies(url, response)
  }

  return response
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  // Responses carrying auth cookies must never be cached.
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header)
    if (value) redirect.headers.set(header, value)
  }
  return redirect
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files and robots.txt (crawlers have no session).
    "/((?!_next/static|_next/image|favicon.ico|robots.txt$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
