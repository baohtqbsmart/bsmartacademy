import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { emailOtpTypeSchema } from "@/features/auth/schemas"

/**
 * Auth e-mails must link to /auth/confirm with a token hash that the server
 * verifies. Supabase's default templates sign users in through a URL fragment
 * (#access_token=…) that never reaches the server, so invitations would fail.
 */
const root = path.resolve(import.meta.dirname, "../..")
const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8")

describe.each(["invite", "recovery", "email_change"])("%s e-mail", (type) => {
  const html = readFileSync(path.join(root, `supabase/templates/${type}.html`), "utf8")

  it("links to /auth/confirm with a token hash and its type", () => {
    expect(html).toContain(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`)
    expect(emailOtpTypeSchema.safeParse(type).success).toBe(true)
    expect(html).not.toContain("ConfirmationURL")
  })

  it("is the template configured for the project", () => {
    expect(config).toContain(`[auth.email.template.${type}]`)
    expect(config).toContain(`content_path = "./supabase/templates/${type}.html"`)
  })
})

describe("auth settings", () => {
  it.each([
    ["enable_signup = false", "no self sign-up"],
    ["enable_anonymous_sign_ins = false", "no anonymous users"],
    ['password_requirements = "letters_digits"', "letters and digits"],
    ["secure_password_change = true", "recent sign-in to change a password"],
    ["enable_refresh_token_rotation = true", "refresh token rotation"],
  ])("%s (%s)", (line) => {
    expect(config).toContain(line)
  })
})
