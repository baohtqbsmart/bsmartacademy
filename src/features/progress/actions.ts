"use server"

import { refresh } from "next/cache"

import { setWorkUnitSchema } from "@/features/progress/schemas"
import { setWorkUnit } from "@/features/progress/server/progress-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function setWorkUnitAction(input: unknown) {
  return runAction(setWorkUnitSchema, input, async ({ kind, id, unitId }) => {
    await requirePermission(kind === "assignment" ? "assignments.write" : "tests.write")
    await setWorkUnit(await createClient(), kind, id, unitId)
    refresh()
  })
}
