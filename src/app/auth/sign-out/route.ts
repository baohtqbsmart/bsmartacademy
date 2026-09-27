import { NextResponse, type NextRequest } from "next/server"

import { routes } from "@/config/routes"
import { createClient } from "@/lib/supabase/server"

/**
 * Forced sign-out, used when a valid session belongs to a deactivated or
 * profile-less account (see requireUser). Interactive sign-out uses
 * signOutAction instead.
 */
export async function GET(request: NextRequest) {
  // Refuse cross-site requests: another site must not be able to sign people
  // out by linking here. Our own redirects arrive as same-origin (or none).
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(new URL(routes.dashboard, request.url))
  }
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = new URL(routes.login, request.url)
  if (request.nextUrl.searchParams.get("reason") === "inactive") {
    url.searchParams.set("error", "inactive")
  }
  return NextResponse.redirect(url)
}
