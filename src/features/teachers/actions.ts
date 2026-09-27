"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { teacherPath } from "@/config/routes"
import {
  qualificationIdSchema,
  qualificationSchema,
  teacherIdSchema,
  teacherSchema,
  teacherSubjectsSchema,
} from "@/features/teachers/schemas"
import {
  addQualification,
  createTeacher,
  removeQualification,
  setTeacherArchived,
  setTeacherSubjects,
  updateTeacher,
} from "@/features/teachers/server/teacher-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

const updateTeacherSchema = teacherSchema.extend({ teacherId: z.uuid() })

export async function createTeacherAction(input: unknown) {
  return runAction(teacherSchema, input, async (data) => {
    await requirePermission("teachers.write")
    const id = await createTeacher(await createClient(), data)
    redirect(teacherPath(id))
  })
}

export async function updateTeacherAction(teacherId: string, input: unknown) {
  const fields = typeof input === "object" && input !== null ? input : {}
  return runAction(updateTeacherSchema, { ...fields, teacherId }, async (data) => {
    await requirePermission("teachers.write")
    await updateTeacher(await createClient(), data.teacherId, data)
    redirect(teacherPath(data.teacherId))
  })
}

export async function archiveTeacherAction(input: unknown) {
  return runAction(teacherIdSchema, input, async ({ teacherId }) => {
    await requirePermission("teachers.write")
    await setTeacherArchived(await createClient(), teacherId, true)
    refresh()
  })
}

export async function restoreTeacherAction(input: unknown) {
  return runAction(teacherIdSchema, input, async ({ teacherId }) => {
    await requirePermission("teachers.write")
    await setTeacherArchived(await createClient(), teacherId, false)
    refresh()
  })
}

export async function setTeacherSubjectsAction(input: unknown) {
  return runAction(teacherSubjectsSchema, input, async ({ teacherId, subjectIds }) => {
    await requirePermission("teachers.write")
    await setTeacherSubjects(await createClient(), teacherId, subjectIds)
    refresh()
  })
}

export async function addQualificationAction(input: unknown) {
  return runAction(qualificationSchema, input, async (data) => {
    await requirePermission("teachers.write")
    await addQualification(await createClient(), data)
    refresh()
  })
}

export async function removeQualificationAction(input: unknown) {
  return runAction(qualificationIdSchema, input, async ({ qualificationId }) => {
    await requirePermission("teachers.write")
    await removeQualification(await createClient(), qualificationId)
    refresh()
  })
}
