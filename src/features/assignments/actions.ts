"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { assignmentPath, assignmentWorkPath, routes } from "@/config/routes"
import {
  assignmentIdSchema,
  assignmentSchema,
  attachmentIdSchema,
  gradeSchema,
  lifecycleSchema,
  questionIdSchema,
  questionSchema,
  recordAttachmentSchema,
  recordSubmissionFileSchema,
  resubmissionSchema,
  returnGradesSchema,
  saveWorkSchema,
  submissionFileIdSchema,
  submissionIdSchema,
  updateAssignmentSchema,
} from "@/features/assignments/schemas"
import {
  changeAssignmentStatus,
  createAssignment,
  deleteDraft,
  deleteQuestion,
  recordAttachment,
  removeAttachment,
  saveQuestion,
  updateAssignment,
} from "@/features/assignments/server/assignment-service"
import {
  gradeSubmission,
  recordSubmissionFile,
  removeSubmissionFile,
  returnGrades,
  saveWork,
  setResubmission,
  startSubmission,
  submitWork,
} from "@/features/assignments/server/submission-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks the permission; the database then enforces the class,
// the lifecycle, the submission lock and the file rules.

// --- Teachers --------------------------------------------------------------

export async function createAssignmentAction(input: unknown) {
  return runAction(assignmentSchema, input, async (data) => {
    await requirePermission("assignments.write")
    const id = await createAssignment(await createClient(), data)
    redirect(assignmentPath(id))
  })
}

export async function updateAssignmentAction(assignmentId: string, input: unknown) {
  const fields = typeof input === "object" && input !== null ? input : {}
  return runAction(updateAssignmentSchema, { ...fields, assignmentId }, async ({ assignmentId: id, ...data }) => {
    await requirePermission("assignments.write")
    await updateAssignment(await createClient(), id, data)
    redirect(assignmentPath(id))
  })
}

export async function changeAssignmentStatusAction(input: unknown) {
  return runAction(lifecycleSchema, input, async (data) => {
    await requirePermission("assignments.write")
    await changeAssignmentStatus(await createClient(), data)
    refresh()
  })
}

export async function deleteDraftAction(input: unknown) {
  return runAction(assignmentIdSchema, input, async ({ assignmentId }) => {
    await requirePermission("assignments.write")
    await deleteDraft(await createClient(), assignmentId)
    redirect(routes.assignments)
  })
}

export async function saveQuestionAction(input: unknown) {
  return runAction(questionSchema, input, async (data) => {
    await requirePermission("assignments.write")
    await saveQuestion(await createClient(), data)
    refresh()
  })
}

export async function deleteQuestionAction(input: unknown) {
  return runAction(questionIdSchema, input, async ({ questionId }) => {
    await requirePermission("assignments.write")
    await deleteQuestion(await createClient(), questionId)
    refresh()
  })
}

export async function recordAttachmentAction(input: unknown) {
  return runAction(recordAttachmentSchema, input, async (data) => {
    await requirePermission("assignments.write")
    await recordAttachment(await createClient(), data)
    refresh()
  })
}

export async function removeAttachmentAction(input: unknown) {
  return runAction(attachmentIdSchema, input, async ({ attachmentId }) => {
    await requirePermission("assignments.write")
    await removeAttachment(await createClient(), attachmentId)
    refresh()
  })
}

export async function gradeSubmissionAction(input: unknown) {
  return runAction(gradeSchema, input, async (data) => {
    await requirePermission("assignments.write")
    await gradeSubmission(await createClient(), data)
    refresh()
  })
}

export async function returnGradesAction(input: unknown) {
  return runAction(returnGradesSchema, input, async ({ assignmentId, submissionId }) => {
    await requirePermission("assignments.write")
    const count = await returnGrades(await createClient(), assignmentId, submissionId)
    refresh()
    return count
  })
}

export async function setResubmissionAction(input: unknown) {
  return runAction(resubmissionSchema, input, async ({ submissionId, allowed }) => {
    await requirePermission("assignments.write")
    await setResubmission(await createClient(), submissionId, allowed)
    refresh()
  })
}

// --- Students --------------------------------------------------------------

export async function startSubmissionAction(input: unknown) {
  return runAction(assignmentIdSchema, input, async ({ assignmentId }) => {
    await requirePermission("submissions.write")
    await startSubmission(await createClient(), assignmentId)
    redirect(assignmentWorkPath(assignmentId))
  })
}

export async function saveWorkAction(input: unknown) {
  return runAction(saveWorkSchema, input, async (data) => {
    await requirePermission("submissions.write")
    await saveWork(await createClient(), data)
  })
}

export async function submitWorkAction(input: unknown) {
  return runAction(submissionIdSchema, input, async ({ submissionId }) => {
    await requirePermission("submissions.write")
    const submittedAt = await submitWork(await createClient(), submissionId)
    refresh()
    return submittedAt
  })
}

export async function recordSubmissionFileAction(input: unknown) {
  return runAction(recordSubmissionFileSchema, input, async (data) => {
    await requirePermission("submissions.write")
    await recordSubmissionFile(await createClient(), data)
    refresh()
  })
}

export async function removeSubmissionFileAction(input: unknown) {
  return runAction(submissionFileIdSchema, input, async ({ fileId }) => {
    await requirePermission("submissions.write")
    await removeSubmissionFile(await createClient(), fileId)
    refresh()
  })
}
