"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { messageThreadPath } from "@/config/routes"
import {
  announcementIdSchema,
  announcementSchema,
  markReadSchema,
  messageSchema,
  preferenceSchema,
  startThreadSchema,
  threadIdSchema,
} from "@/features/communication/schemas"
import {
  archiveAnnouncement,
  createAnnouncement,
  markNotificationsRead,
  markThreadRead,
  sendMessage,
  setPreference,
  startThread,
} from "@/features/communication/server/communication-service"
import { runAction } from "@/lib/action"
import { requirePermission, requireUser } from "@/lib/auth/session"
import { academyInputToIso } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"

// Every action re-checks who is calling; the database enforces audiences,
// ownership and the teacher–parent relationship.

export async function markNotificationsReadAction(input: unknown) {
  return runAction(markReadSchema, input, async ({ ids }) => {
    await requireUser()
    await markNotificationsRead(await createClient(), ids)
    refresh()
  })
}

export async function preferenceAction(input: unknown) {
  return runAction(preferenceSchema, input, async ({ kind, enabled }) => {
    const user = await requireUser()
    await setPreference(await createClient(), user.id, kind, enabled)
  })
}

export async function createAnnouncementAction(input: unknown) {
  return runAction(announcementSchema, input, async (data) => {
    await requirePermission("announcements.write")
    // Expires at the end of the chosen day (Vietnam time).
    const expiresAt = data.expiresOn ? academyInputToIso(`${data.expiresOn}T23:59`) : null
    await createAnnouncement(await createClient(), { ...data, expiresAt })
    refresh()
  })
}

export async function archiveAnnouncementAction(input: unknown) {
  return runAction(announcementIdSchema, input, async ({ announcementId }) => {
    await requirePermission("announcements.write")
    await archiveAnnouncement(await createClient(), announcementId)
    refresh()
  })
}

export async function startThreadAction(input: unknown) {
  return runAction(startThreadSchema, input, async (data) => {
    await requirePermission("messages.write")
    const id = await startThread(await createClient(), data)
    redirect(messageThreadPath(id))
  })
}

export async function sendMessageAction(input: unknown) {
  return runAction(messageSchema, input, async ({ threadId, body }) => {
    await requirePermission("messages.write")
    await sendMessage(await createClient(), threadId, body)
    refresh()
  })
}

export async function markThreadReadAction(input: unknown) {
  return runAction(threadIdSchema, input, async ({ threadId }) => {
    await requirePermission("messages.read")
    await markThreadRead(await createClient(), threadId)
  })
}
