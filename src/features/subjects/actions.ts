"use server"

import { refresh } from "next/cache"

import { levelIdSchema, levelSchema, subjectIdSchema, subjectSchema } from "@/features/subjects/schemas"
import {
  saveLevel,
  saveSubject,
  setLevelArchived,
  setSubjectArchived,
} from "@/features/subjects/server/subject-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Subjects and levels are catalogue data, governed by courses.write.

export async function saveSubjectAction(input: unknown) {
  return runAction(subjectSchema, input, async (data) => {
    await requirePermission("courses.write")
    const id = await saveSubject(await createClient(), data)
    refresh()
    return id
  })
}

export async function archiveSubjectAction(input: unknown) {
  return runAction(subjectIdSchema, input, async ({ subjectId }) => {
    await requirePermission("courses.write")
    await setSubjectArchived(await createClient(), subjectId, true)
    refresh()
  })
}

export async function restoreSubjectAction(input: unknown) {
  return runAction(subjectIdSchema, input, async ({ subjectId }) => {
    await requirePermission("courses.write")
    await setSubjectArchived(await createClient(), subjectId, false)
    refresh()
  })
}

export async function saveLevelAction(input: unknown) {
  return runAction(levelSchema, input, async (data) => {
    await requirePermission("courses.write")
    await saveLevel(await createClient(), data)
    refresh()
  })
}

export async function archiveLevelAction(input: unknown) {
  return runAction(levelIdSchema, input, async ({ levelId }) => {
    await requirePermission("courses.write")
    await setLevelArchived(await createClient(), levelId, true)
    refresh()
  })
}

export async function restoreLevelAction(input: unknown) {
  return runAction(levelIdSchema, input, async ({ levelId }) => {
    await requirePermission("courses.write")
    await setLevelArchived(await createClient(), levelId, false)
    refresh()
  })
}
