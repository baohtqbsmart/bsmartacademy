import { describe, expect, it } from "vitest"

import { can, toGrants } from "@/lib/auth/permissions"

describe("toGrants / can", () => {
  const grants = toGrants([
    { permission_code: "students.read", scope: "assigned" },
    { permission_code: "classes.read", scope: "assigned" },
    { permission_code: "future.module", scope: "all" },
  ])

  it("groups scopes by permission and ignores unknown codes", () => {
    expect(grants).toEqual({ "students.read": ["assigned"], "classes.read": ["assigned"] })
  })

  it("checks permission with any scope by default", () => {
    expect(can(grants, "students.read")).toBe(true)
    expect(can(grants, "students.write")).toBe(false)
  })

  it("checks required scopes", () => {
    expect(can(grants, "students.read", ["all"])).toBe(false)
    expect(can(grants, "students.read", ["all", "assigned"])).toBe(true)
  })
})
