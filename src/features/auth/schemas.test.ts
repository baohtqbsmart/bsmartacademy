import { describe, expect, it } from "vitest"

import { forgotPasswordSchema, signInSchema } from "@/features/auth/schemas"

describe("signInSchema", () => {
  it.each(["hungpd@bsmart", "HungPD@BSmart", "admin@bsmart.test"])("accepts the login %s", (email) => {
    const result = signInSchema.safeParse({ email: ` ${email} `, password: "x" })
    expect(result.success).toBe(true)
    expect(result.data?.email).toBe(email.toLowerCase())
  })

  it.each(["hungpd", "hung pd@bsmart", "@bsmart", "hungpd@", "a@b@c"])("rejects %s", (email) => {
    expect(signInSchema.safeParse({ email, password: "x" }).success).toBe(false)
  })

  it("still requires a deliverable address for password resets", () => {
    expect(forgotPasswordSchema.safeParse({ email: "hungpd@bsmart" }).success).toBe(false)
  })
})
