"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { routes, testAttemptPath, testPath, testTakePath } from "@/config/routes"
import {
  addQuestionsSchema,
  attemptIdSchema,
  gradeAnswerSchema,
  moveTestQuestionSchema,
  saveAnswerSchema,
  spokenAnswerSchema,
  testIdSchema,
  testLifecycleSchema,
  testQuestionIdSchema,
  testQuestionPointsSchema,
  testSchema,
} from "@/features/tests/schemas"
import {
  gradeAnswer,
  recordSpokenAnswer,
  saveAnswer,
  startTest,
  submitAttempt,
} from "@/features/tests/server/attempt-service"
import {
  addQuestions,
  changeTestStatus,
  closeExpiredAttempts,
  createTest,
  deleteDraftTest,
  moveTestQuestion,
  removeTestQuestion,
  setTestQuestionPoints,
  updateTest,
} from "@/features/tests/server/test-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Every action re-checks its permission; the database then enforces the
// class, the draft-only builder, attempts, deadlines and the review policy.

// --- Test builder ----------------------------------------------------------

export async function createTestAction(input: unknown) {
  return runAction(testSchema, input, async (data) => {
    await requirePermission("tests.write")
    const id = await createTest(await createClient(), data)
    redirect(testPath(id))
  })
}

export async function updateTestAction(testId: string, input: unknown) {
  return runAction(testSchema, input, async (data) => {
    await requirePermission("tests.write")
    await updateTest(await createClient(), testId, data)
    redirect(testPath(testId))
  })
}

export async function changeTestStatusAction(input: unknown) {
  return runAction(testLifecycleSchema, input, async (data) => {
    await requirePermission("tests.write")
    await changeTestStatus(await createClient(), data)
    refresh()
  })
}

export async function deleteDraftTestAction(input: unknown) {
  return runAction(testIdSchema, input, async ({ testId }) => {
    await requirePermission("tests.write")
    await deleteDraftTest(await createClient(), testId)
    redirect(routes.tests)
  })
}

export async function addQuestionsAction(input: unknown) {
  return runAction(addQuestionsSchema, input, async ({ testId, questionIds }) => {
    await requirePermission("tests.write")
    await requirePermission("question_bank.read")
    const added = await addQuestions(await createClient(), testId, questionIds)
    refresh()
    return added
  })
}

export async function removeTestQuestionAction(input: unknown) {
  return runAction(testQuestionIdSchema, input, async ({ testQuestionId }) => {
    await requirePermission("tests.write")
    await removeTestQuestion(await createClient(), testQuestionId)
    refresh()
  })
}

export async function moveTestQuestionAction(input: unknown) {
  return runAction(moveTestQuestionSchema, input, async ({ testQuestionId, direction }) => {
    await requirePermission("tests.write")
    await moveTestQuestion(await createClient(), testQuestionId, direction)
    refresh()
  })
}

export async function setTestQuestionPointsAction(input: unknown) {
  return runAction(testQuestionPointsSchema, input, async ({ testQuestionId, points }) => {
    await requirePermission("tests.write")
    await setTestQuestionPoints(await createClient(), testQuestionId, points)
    refresh()
  })
}

export async function closeExpiredAttemptsAction(input: unknown) {
  return runAction(testIdSchema, input, async ({ testId }) => {
    await requirePermission("tests.write")
    const closed = await closeExpiredAttempts(await createClient(), testId)
    refresh()
    return closed
  })
}

export async function gradeAnswerAction(input: unknown) {
  return runAction(gradeAnswerSchema, input, async (data) => {
    await requirePermission("tests.write")
    await gradeAnswer(await createClient(), data)
    refresh()
  })
}

// --- Students --------------------------------------------------------------

export async function startTestAction(input: unknown) {
  return runAction(testIdSchema, input, async ({ testId }) => {
    await requirePermission("test_attempts.write")
    await startTest(await createClient(), testId)
    redirect(testTakePath(testId))
  })
}

export async function saveAnswerAction(input: unknown) {
  return runAction(saveAnswerSchema, input, async ({ attemptId, questionId, response }) => {
    await requirePermission("test_attempts.write")
    await saveAnswer(await createClient(), { attemptId, questionId, response })
  })
}

export async function recordSpokenAnswerAction(input: unknown) {
  return runAction(spokenAnswerSchema, input, async (data) => {
    await requirePermission("test_attempts.write")
    await recordSpokenAnswer(await createClient(), data)
    refresh()
  })
}

export async function submitAttemptAction(input: unknown) {
  return runAction(attemptIdSchema.extend(testIdSchema.shape), input, async ({ attemptId, testId }) => {
    await requirePermission("test_attempts.write")
    await submitAttempt(await createClient(), attemptId)
    redirect(`${testAttemptPath(testId, attemptId)}?submitted=1`)
  })
}
