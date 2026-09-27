"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { questionPath } from "@/config/routes"
import { questionFormSchema, questionIdSchema, questionMediaSchema } from "@/features/question-bank/schemas"
import {
  duplicateBankQuestion,
  removeQuestionMedia,
  saveBankQuestion,
  setBankQuestionArchived,
  setQuestionMedia,
} from "@/features/question-bank/server/bank-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// The database checks ownership (teachers edit their own questions) and
// re-validates every question and key.

export async function saveQuestionAction(input: unknown) {
  return runAction(questionFormSchema, input, async (payload) => {
    await requirePermission("question_bank.write")
    const id = await saveBankQuestion(await createClient(), payload)
    redirect(questionPath(id))
  })
}

export async function duplicateQuestionAction(input: unknown) {
  return runAction(questionIdSchema, input, async ({ questionId }) => {
    await requirePermission("question_bank.write")
    const id = await duplicateBankQuestion(await createClient(), questionId)
    redirect(questionPath(id))
  })
}

export async function archiveQuestionAction(input: unknown) {
  return runAction(questionIdSchema, input, async ({ questionId }) => {
    await requirePermission("question_bank.write")
    await setBankQuestionArchived(await createClient(), questionId, true)
    refresh()
  })
}

export async function restoreQuestionAction(input: unknown) {
  return runAction(questionIdSchema, input, async ({ questionId }) => {
    await requirePermission("question_bank.write")
    await setBankQuestionArchived(await createClient(), questionId, false)
    refresh()
  })
}

export async function setQuestionMediaAction(input: unknown) {
  return runAction(questionMediaSchema, input, async (data) => {
    await requirePermission("question_bank.write")
    await setQuestionMedia(await createClient(), data)
    refresh()
  })
}

export async function removeQuestionMediaAction(input: unknown) {
  return runAction(questionIdSchema, input, async ({ questionId }) => {
    await requirePermission("question_bank.write")
    await removeQuestionMedia(await createClient(), questionId)
    refresh()
  })
}
