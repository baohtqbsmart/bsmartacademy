"use server"

import { refresh } from "next/cache"

import { deleteRegisterSchema, saveAttendanceSchema } from "@/features/attendance/schemas"
import { deleteRegister, saveAttendance } from "@/features/attendance/server/attendance-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// The database re-checks that a teacher teaches the class, that every student
// was enrolled on that date, and that no record is duplicated.

export async function saveAttendanceAction(input: unknown) {
  return runAction(saveAttendanceSchema, input, async (data) => {
    await requirePermission("attendance.write")
    await saveAttendance(await createClient(), data)
    refresh()
  })
}

export async function deleteRegisterAction(input: unknown) {
  return runAction(deleteRegisterSchema, input, async ({ sessionId }) => {
    await requirePermission("attendance.write", ["all"])
    await deleteRegister(await createClient(), sessionId)
    refresh()
  })
}
