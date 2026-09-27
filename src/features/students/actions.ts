"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { studentPath } from "@/config/routes"
import {
  feedbackIdSchema,
  feedbackSchema,
  linkParentSchema,
  studentIdSchema,
  studentSchema,
  unlinkParentSchema,
} from "@/features/students/schemas"
import { addFeedback, archiveFeedback } from "@/features/students/server/feedback-service"
import {
  createStudent,
  linkParent,
  markStudentPhotoUploaded,
  setStudentArchived,
  unlinkParent,
  updateStudent,
} from "@/features/students/server/student-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Every action re-checks its permission; RLS and the SQL functions check again.

export async function createStudentAction(input: unknown) {
  return runAction(studentSchema, input, async (data) => {
    await requirePermission("students.write")
    const id = await createStudent(await createClient(), data)
    redirect(studentPath(id))
  })
}

const updateStudentSchema = studentSchema.extend({ studentId: z.uuid() })

export async function updateStudentAction(studentId: string, input: unknown) {
  const fields = typeof input === "object" && input !== null ? input : {}
  return runAction(updateStudentSchema, { ...fields, studentId }, async (data) => {
    await requirePermission("students.write")
    await updateStudent(await createClient(), data.studentId, data)
    redirect(studentPath(data.studentId))
  })
}

export async function archiveStudentAction(input: unknown) {
  return runAction(studentIdSchema, input, async ({ studentId }) => {
    await requirePermission("students.write")
    await setStudentArchived(await createClient(), studentId, true)
    refresh()
  })
}

export async function restoreStudentAction(input: unknown) {
  return runAction(studentIdSchema, input, async ({ studentId }) => {
    await requirePermission("students.write")
    await setStudentArchived(await createClient(), studentId, false)
    refresh()
  })
}

export async function markStudentPhotoAction(input: unknown) {
  return runAction(studentIdSchema, input, async ({ studentId }) => {
    await requirePermission("students.write")
    await markStudentPhotoUploaded(await createClient(), studentId)
    refresh()
  })
}

export async function linkParentAction(input: unknown) {
  return runAction(linkParentSchema, input, async (data) => {
    await requirePermission("students.write")
    await linkParent(await createClient(), data)
    refresh()
  })
}

export async function unlinkParentAction(input: unknown) {
  return runAction(unlinkParentSchema, input, async ({ studentId, parentId }) => {
    await requirePermission("students.write")
    await unlinkParent(await createClient(), studentId, parentId)
    refresh()
  })
}


export async function addFeedbackAction(input: unknown) {
  return runAction(feedbackSchema, input, async ({ studentId, body }) => {
    await requirePermission("feedback.write")
    await addFeedback(await createClient(), studentId, body)
    refresh()
  })
}

export async function archiveFeedbackAction(input: unknown) {
  return runAction(feedbackIdSchema, input, async ({ feedbackId }) => {
    await requirePermission("feedback.write")
    await archiveFeedback(await createClient(), feedbackId)
    refresh()
  })
}
