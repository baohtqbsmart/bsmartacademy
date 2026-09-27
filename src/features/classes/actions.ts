"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { classPath } from "@/config/routes"
import {
  assignTeacherSchema,
  classIdSchema,
  classSchema,
  removeTeacherSchema,
  slotIdSchema,
  slotSchema,
  updateClassSchema,
} from "@/features/classes/schemas"
import {
  assignTeacher,
  createClass,
  deleteSlot,
  removeTeacher,
  saveSlot,
  setClassArchived,
  updateClass,
} from "@/features/classes/server/class-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function createClassAction(input: unknown) {
  return runAction(classSchema, input, async (data) => {
    await requirePermission("classes.write")
    const id = await createClass(await createClient(), data)
    redirect(classPath(id))
  })
}

export async function updateClassAction(classId: string, input: unknown) {
  const fields = typeof input === "object" && input !== null ? input : {}
  return runAction(updateClassSchema, { ...fields, classId }, async (data) => {
    await requirePermission("classes.write")
    await updateClass(await createClient(), data.classId, data)
    redirect(classPath(data.classId))
  })
}

export async function archiveClassAction(input: unknown) {
  return runAction(classIdSchema, input, async ({ classId }) => {
    await requirePermission("classes.write")
    await setClassArchived(await createClient(), classId, true)
    refresh()
  })
}

export async function restoreClassAction(input: unknown) {
  return runAction(classIdSchema, input, async ({ classId }) => {
    await requirePermission("classes.write")
    await setClassArchived(await createClient(), classId, false)
    refresh()
  })
}

export async function assignTeacherAction(input: unknown) {
  return runAction(assignTeacherSchema, input, async (data) => {
    await requirePermission("classes.write")
    await assignTeacher(await createClient(), data)
    refresh()
  })
}

export async function removeTeacherAction(input: unknown) {
  return runAction(removeTeacherSchema, input, async ({ classId, teacherId }) => {
    await requirePermission("classes.write")
    await removeTeacher(await createClient(), classId, teacherId)
    refresh()
  })
}

export async function saveSlotAction(input: unknown) {
  return runAction(slotSchema, input, async (data) => {
    await requirePermission("classes.write")
    await saveSlot(await createClient(), data)
    refresh()
  })
}

export async function deleteSlotAction(input: unknown) {
  return runAction(slotIdSchema, input, async ({ slotId }) => {
    await requirePermission("classes.write")
    await deleteSlot(await createClient(), slotId)
    refresh()
  })
}
