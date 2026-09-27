"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { aiDraftPath, assignmentPath, designPath } from "@/config/routes"
import { generationInputSchema } from "@/features/ai/content"
import { generateDraft, saveAsAssignment, saveAsDesign, saveDraftContent, setDraftStatus } from "@/features/ai/server/ai-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// The AI only ever produces a private draft. Approving and saving are the
// teacher's own actions, and saving creates private or draft content only.

export async function generateDraftAction(input: unknown) {
  return runAction(generationInputSchema, input, async (data) => {
    await requirePermission("ai.use")
    const id = await generateDraft(await createClient(), data)
    redirect(aiDraftPath(id))
  })
}

export async function saveDraftAction(input: unknown) {
  return runAction(z.object({ draftId: z.uuid(), content: z.unknown() }), input, async ({ draftId, content }) => {
    await requirePermission("ai.use")
    const warnings = await saveDraftContent(await createClient(), draftId, content)
    refresh()
    return warnings
  })
}

export async function draftStatusAction(input: unknown) {
  return runAction(z.object({ draftId: z.uuid(), status: z.enum(["approved", "discarded"]) }), input, async ({ draftId, status }) => {
    await requirePermission("ai.use")
    await setDraftStatus(await createClient(), draftId, status)
    refresh()
  })
}

export async function saveAsDesignAction(input: unknown) {
  return runAction(z.object({ draftId: z.uuid() }), input, async ({ draftId }) => {
    await requirePermission("ai.use")
    await requirePermission("designs.write")
    const id = await saveAsDesign(await createClient(), draftId)
    redirect(designPath(id))
  })
}

export async function saveAsAssignmentAction(input: unknown) {
  return runAction(z.object({ draftId: z.uuid(), classId: z.uuid("Choose a class.") }), input, async ({ draftId, classId }) => {
    await requirePermission("ai.use")
    const user = await requirePermission("assignments.write")
    const id = await saveAsAssignment(await createClient(), draftId, classId, user.fullName)
    redirect(assignmentPath(id))
  })
}
