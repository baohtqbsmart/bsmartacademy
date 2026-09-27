import { NextResponse, type NextRequest } from "next/server"

import { routes, safeRedirectPath } from "@/config/routes"
import { emailOtpTypeSchema } from "@/features/auth/schemas"
import { createClient } from "@/lib/supabase/server"

/**
 * Landing point for links in Supabase auth emails (invite, password recovery,
 * email change). Supports both the token-hash template and the PKCE `code` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = emailOtpTypeSchema.safeParse(searchParams.get("type"))

  // Invited and recovering users must choose a password before continuing.
  const needsPassword = type.success && (type.data === "invite" || type.data === "recovery")
  const next = safeRedirectPath(
    searchParams.get("next"),
    needsPassword ? routes.setPassword : routes.dashboard
  )

  const supabase = await createClient()
  let failed = true

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    failed = Boolean(error)
  } else if (tokenHash && type.success) {
    const { error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash })
    failed = Boolean(error)
  }

  const target = failed ? `${routes.login}?error=link_invalid` : next
  return NextResponse.redirect(new URL(target, request.url))
}
