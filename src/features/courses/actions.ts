"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { coursePath } from "@/config/routes"
import {
  courseIdSchema,
  courseSchema,
  moveUnitSchema,
  unitIdSchema,
  unitSchema,
} from "@/features/courses/schemas"
import {
  createCourse,
  deleteUnit,
  moveUnit,
  saveUnit,
  setCourseArchived,
  updateCourse,
} from "@/features/courses/server/course-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

const updateCourseSchema = courseSchema.extend({ courseId: z.uuid() })

export async function createCourseAction(input: unknown) {
  return runAction(courseSchema, input, async (data) => {
    await requirePermission("courses.write")
    const id = await createCourse(await createClient(), data)
    redirect(coursePath(id))
  })
}

export async function updateCourseAction(courseId: string, input: unknown) {
  const fields = typeof input === "object" && input !== null ? input : {}
  return runAction(updateCourseSchema, { ...fields, courseId }, async (data) => {
    await requirePermission("courses.write")
    await updateCourse(await createClient(), data.courseId, data)
    redirect(coursePath(data.courseId))
  })
}

export async function archiveCourseAction(input: unknown) {
  return runAction(courseIdSchema, input, async ({ courseId }) => {
    await requirePermission("courses.write")
    await setCourseArchived(await createClient(), courseId, true)
    refresh()
  })
}

export async function restoreCourseAction(input: unknown) {
  return runAction(courseIdSchema, input, async ({ courseId }) => {
    await requirePermission("courses.write")
    await setCourseArchived(await createClient(), courseId, false)
    refresh()
  })
}

export async function saveUnitAction(input: unknown) {
  return runAction(unitSchema, input, async (data) => {
    await requirePermission("courses.write")
    await saveUnit(await createClient(), data)
    refresh()
  })
}

export async function deleteUnitAction(input: unknown) {
  return runAction(unitIdSchema, input, async ({ unitId }) => {
    await requirePermission("courses.write")
    await deleteUnit(await createClient(), unitId)
    refresh()
  })
}

export async function moveUnitAction(input: unknown) {
  return runAction(moveUnitSchema, input, async ({ unitId, direction }) => {
    await requirePermission("courses.write")
    await moveUnit(await createClient(), unitId, direction)
    refresh()
  })
}
