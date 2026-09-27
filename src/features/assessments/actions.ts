"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { assessmentPath, assessmentSubmissionPath, routes } from "@/config/routes"
import {
  annotationIdSchema,
  annotationSchema,
  commentIdSchema,
  commentSchema,
  gradeSchema,
  resubmissionSchema,
  returnSchema,
  rubricSchema,
  submitSchema,
  taskActionSchema,
  taskIdSchema,
  taskSchema,
  updateAnnotationSchema,
} from "@/features/assessments/schemas"
import {
  addAnnotation,
  archiveRubric,
  changeTaskStatus,
  deleteAnnotation,
  deleteComment,
  deleteDraftTask,
  gradeWork,
  returnGrades,
  saveComment,
  saveRubric,
  saveTask,
  setResubmission,
  submitWork,
  updateAnnotation,
} from "@/features/assessments/server/assessment-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks its permission; the database checks the class, the
// student, attempts, the rubric ranges and when grades become visible.

export async function saveTaskAction(input: unknown) {
  return runAction(taskSchema, input, async (data) => {
    await requirePermission("assessments.write")
    const id = await saveTask(await createClient(), data)
    redirect(assessmentPath(id))
  })
}

export async function taskAction(input: unknown) {
  return runAction(taskActionSchema, input, async ({ taskId, action }) => {
    await requirePermission("assessments.write")
    await changeTaskStatus(await createClient(), taskId, action)
    refresh()
  })
}

export async function deleteTaskAction(input: unknown) {
  return runAction(taskIdSchema, input, async ({ taskId }) => {
    await requirePermission("assessments.write")
    await deleteDraftTask(await createClient(), taskId)
    redirect(routes.assessments)
  })
}

export async function saveRubricAction(input: unknown) {
  return runAction(rubricSchema, input, async (data) => {
    await requirePermission("assessments.write")
    await saveRubric(await createClient(), data)
    refresh()
  })
}

export async function archiveRubricAction(input: unknown) {
  return runAction(z.object({ rubricId: z.uuid() }), input, async ({ rubricId }) => {
    await requirePermission("assessments.write")
    await archiveRubric(await createClient(), rubricId)
    refresh()
  })
}

export async function submitAssessmentAction(input: unknown) {
  return runAction(submitSchema, input, async (data) => {
    await requirePermission("assessments.submit")
    const id = await submitWork(await createClient(), data)
    redirect(`${assessmentSubmissionPath(id)}?submitted=1`)
  })
}

export async function gradeAction(input: unknown) {
  return runAction(gradeSchema, input, async (data) => {
    await requirePermission("assessments.write")
    const total = await gradeWork(await createClient(), data)
    refresh()
    return total
  })
}

export async function returnGradesAction(input: unknown) {
  return runAction(returnSchema, input, async ({ taskId, submissionId }) => {
    await requirePermission("assessments.write")
    const n = await returnGrades(await createClient(), taskId, submissionId)
    refresh()
    return n
  })
}

export async function resubmissionAction(input: unknown) {
  return runAction(resubmissionSchema, input, async ({ submissionId, allowed }) => {
    await requirePermission("assessments.write")
    await setResubmission(await createClient(), submissionId, allowed)
    refresh()
  })
}

export async function addAnnotationAction(input: unknown) {
  return runAction(annotationSchema, input, async (data) => {
    await requirePermission("assessments.write")
    await addAnnotation(await createClient(), data)
    refresh()
  })
}

export async function updateAnnotationAction(input: unknown) {
  return runAction(updateAnnotationSchema, input, async (data) => {
    await requirePermission("assessments.write")
    await updateAnnotation(await createClient(), data)
    refresh()
  })
}

export async function deleteAnnotationAction(input: unknown) {
  return runAction(annotationIdSchema, input, async ({ annotationId }) => {
    await requirePermission("assessments.write")
    await deleteAnnotation(await createClient(), annotationId)
    refresh()
  })
}

export async function saveCommentAction(input: unknown) {
  return runAction(commentSchema, input, async (data) => {
    await requirePermission("assessments.write")
    await saveComment(await createClient(), data)
    refresh()
  })
}

export async function deleteCommentAction(input: unknown) {
  return runAction(commentIdSchema, input, async ({ commentId }) => {
    await requirePermission("assessments.write")
    await deleteComment(await createClient(), commentId)
    refresh()
  })
}

