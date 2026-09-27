import { describe, expect, it } from "vitest"

import { applySessionPolicy } from "@/lib/supabase/session-cookies"

describe("applySessionPolicy", () => {
  const persistent = { path: "/", maxAge: 34_560_000, sameSite: "lax" }

  it("keeps persistent cookies when the user chose to be remembered", () => {
    expect(applySessionPolicy(persistent, false)).toEqual(persistent)
  })

  it("turns auth cookies into browser-session cookies otherwise", () => {
    expect(applySessionPolicy({ ...persistent, expires: new Date() }, true)).toEqual({ path: "/", sameSite: "lax" })
  })

  it("still lets cookies be deleted", () => {
    expect(applySessionPolicy({ path: "/", maxAge: 0 }, true)).toEqual({ path: "/", maxAge: 0 })
  })
})
