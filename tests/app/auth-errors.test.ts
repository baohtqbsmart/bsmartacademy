import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { fromAuthError } from "@/lib/errors"

describe("fromAuthError", () => {
  it("says the service is unreachable when the auth server never answered", () => {
    const error = fromAuthError(new AuthRetryableFetchError("fetch failed", 0))
    expect(error.message).toMatch(/cannot be reached/)
  })

  it("keeps wrong credentials distinct from an outage", () => {
    const error = fromAuthError(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))
    expect(error.message).toBe("Incorrect email or password.")
  })

  it("falls back to the generic message for other auth errors", () => {
    const error = fromAuthError(new AuthApiError("Something else", 500, "unexpected_failure"))
    expect(error.message).toBe("Authentication failed. Please try again.")
  })
})
