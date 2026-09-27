"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { onlineSessionPath } from "@/config/routes"
import {
  homeworkSchema,
  materialFileSchema,
  materialIdSchema,
  materialLinkSchema,
  materialVisibilitySchema,
  notesSchema,
  sessionIdSchema,
  sessionSchema,
  sessionStatusSchema,
} from "@/features/online/schemas"
import {
  addFileMaterial,
  addLinkMaterial,
  changeSessionStatus,
  joinSession,
  linkHomework,
  removeMaterial,
  saveNotes,
  saveSession,
  setMaterialVisibility,
  unlinkHomework,
} from "@/features/online/server/session-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks the permission; the database checks the class, the
// teacher, the times, the meeting link and who may see what.

export async function saveSessionAction(input: unknown) {
  return runAction(sessionSchema, input, async (data) => {
    await requirePermission("online.write")
    const id = await saveSession(await createClient(), data)
    redirect(onlineSessionPath(id))
  })
}

export async function sessionStatusAction(input: unknown) {
  return runAction(sessionStatusSchema, input, async ({ sessionId, action, reason }) => {
    await requirePermission("online.write")
    const url = await changeSessionStatus(await createClient(), sessionId, action, reason)
    refresh()
    // "Start lesson" opens the meeting for the teacher.
    return action === "start" || action === "reopen" ? url : null
  })
}

export async function addLinkMaterialAction(input: unknown) {
  return runAction(materialLinkSchema, input, async (data) => {
    await requirePermission("online.write")
    await addLinkMaterial(await createClient(), data)
    refresh()
  })
}

export async function addFileMaterialAction(input: unknown) {
  return runAction(materialFileSchema, input, async (data) => {
    await requirePermission("online.write")
    await addFileMaterial(await createClient(), data)
    refresh()
  })
}

export async function materialVisibilityAction(input: unknown) {
  return runAction(materialVisibilitySchema, input, async ({ materialId, visible }) => {
    await requirePermission("online.write")
    await setMaterialVisibility(await createClient(), materialId, visible)
    refresh()
  })
}

export async function removeMaterialAction(input: unknown) {
  return runAction(materialIdSchema, input, async ({ materialId }) => {
    await requirePermission("online.write")
    await removeMaterial(await createClient(), materialId)
    refresh()
  })
}

export async function linkHomeworkAction(input: unknown) {
  return runAction(homeworkSchema, input, async ({ sessionId, assignmentId }) => {
    await requirePermission("online.write")
    await linkHomework(await createClient(), sessionId, assignmentId)
    refresh()
  })
}

export async function unlinkHomeworkAction(input: unknown) {
  return runAction(homeworkSchema, input, async ({ sessionId, assignmentId }) => {
    await requirePermission("online.write")
    await unlinkHomework(await createClient(), sessionId, assignmentId)
    refresh()
  })
}

export async function saveNotesAction(input: unknown) {
  return runAction(notesSchema, input, async ({ sessionId, notes }) => {
    await requirePermission("online.write")
    await saveNotes(await createClient(), sessionId, notes)
  })
}

/** Students: logs the join and returns the meeting link to open. */
export async function joinSessionAction(input: unknown) {
  return runAction(sessionIdSchema, input, async ({ sessionId }) => {
    await requirePermission("online.read")
    return joinSession(await createClient(), sessionId)
  })
}
