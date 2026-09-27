"use server"

import { refresh } from "next/cache"

import { enrollSchema, enrollmentStatusSchema, transferSchema } from "@/features/enrollments/schemas"
import {
  enrollStudent,
  setEnrollmentStatus,
  transferEnrollment,
} from "@/features/enrollments/server/enrollment-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Used from both the student profile and the class roster.

export async function enrollStudentAction(input: unknown) {
  return runAction(enrollSchema, input, async (data) => {
    await requirePermission("enrollments.write")
    await enrollStudent(await createClient(), data)
    refresh()
  })
}

export async function setEnrollmentStatusAction(input: unknown) {
  return runAction(enrollmentStatusSchema, input, async ({ enrollmentId, status }) => {
    await requirePermission("enrollments.write")
    await setEnrollmentStatus(await createClient(), enrollmentId, status)
    refresh()
  })
}

export async function transferEnrollmentAction(input: unknown) {
  return runAction(transferSchema, input, async ({ enrollmentId, classId }) => {
    await requirePermission("enrollments.write")
    await transferEnrollment(await createClient(), enrollmentId, classId)
    refresh()
  })
}
