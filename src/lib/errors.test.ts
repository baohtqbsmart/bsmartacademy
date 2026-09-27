import type { PostgrestError } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { fromPostgrestError } from "@/lib/errors"

const pgError = (code: string, message: string) =>
  ({ code, message, details: "", hint: "", name: "PostgrestError" }) as unknown as PostgrestError

describe("fromPostgrestError", () => {
  it("shows messages written by our SQL functions", () => {
    const error = fromPostgrestError(pgError("42501", "You can only manage users with a lower role than your own."))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "You can only manage users with a lower role than your own." })
  })

  it("hides raw Postgres messages behind a readable one", () => {
    const error = fromPostgrestError(pgError("42501", 'new row violates row-level security policy for table "students"'))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "You do not have permission to do this." })
  })

  it("maps unknown codes to INTERNAL", () => {
    expect(fromPostgrestError(pgError("XX000", "boom")).code).toBe("INTERNAL")
  })
})
