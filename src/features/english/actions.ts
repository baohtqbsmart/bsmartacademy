"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { lessonPath, lessonSubmissionPath, wordSetPath, routes } from "@/config/routes"
import {
  clearWordMediaSchema,
  lessonIdSchema,
  lessonMediaSchema,
  lessonPracticeSchema,
  lessonQuestionIdSchema,
  lessonQuestionsSchema,
  lessonSchema,
  lessonStatusSchema,
  lessonWorkSchema,
  practiceSchema,
  reviewSchema,
  setSchema,
  setStatusSchema,
  setWordsSchema,
  wordMediaSchema,
  wordSchema,
  wordStatusSchema,
} from "@/features/english/schemas"
import {
  addLessonQuestions,
  removeLessonQuestion,
  reviewSubmission,
  saveLesson,
  setLessonMedia,
  setLessonStatus,
  submitPractice,
  submitWork,
} from "@/features/english/server/lesson-service"
import {
  clearWordMedia,
  recordPractice,
  saveSet,
  saveWord,
  setSetStatus,
  setSetWords,
  setWordMedia,
  setWordStatus,
} from "@/features/english/server/vocabulary-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks the permission; the database enforces ownership of
// content, what students may submit, and who reviews whose work.

// --- Content ---------------------------------------------------------------

export async function saveWordAction(input: unknown) {
  return runAction(wordSchema, input, async (data) => {
    await requirePermission("english.write")
    const id = await saveWord(await createClient(), data)
    if (!data.wordId) redirect(`${routes.vocabulary}?q=${encodeURIComponent(data.word)}&status=${data.published ? "published" : "draft"}`)
    refresh()
    return id
  })
}

export async function setWordStatusAction(input: unknown) {
  return runAction(wordStatusSchema, input, async ({ wordId, status }) => {
    await requirePermission("english.write")
    await setWordStatus(await createClient(), wordId, status)
    refresh()
  })
}

export async function setWordMediaAction(input: unknown) {
  return runAction(wordMediaSchema, input, async (data) => {
    await requirePermission("english.write")
    await setWordMedia(await createClient(), data)
    refresh()
  })
}

export async function clearWordMediaAction(input: unknown) {
  return runAction(clearWordMediaSchema, input, async ({ wordId, field }) => {
    await requirePermission("english.write")
    await clearWordMedia(await createClient(), wordId, field)
    refresh()
  })
}

export async function saveSetAction(input: unknown) {
  return runAction(setSchema, input, async (data) => {
    await requirePermission("english.write")
    const id = await saveSet(await createClient(), data)
    if (!data.setId) redirect(wordSetPath(id))
    refresh()
  })
}

export async function setSetWordsAction(input: unknown) {
  return runAction(setWordsSchema, input, async ({ setId, wordIds }) => {
    await requirePermission("english.write")
    await setSetWords(await createClient(), setId, wordIds)
    refresh()
  })
}

export async function setSetStatusAction(input: unknown) {
  return runAction(setStatusSchema, input, async ({ setId, status }) => {
    await requirePermission("english.write")
    await setSetStatus(await createClient(), setId, status)
    refresh()
  })
}

export async function saveLessonAction(input: unknown) {
  return runAction(lessonSchema, input, async (data) => {
    await requirePermission("english.write")
    const id = await saveLesson(await createClient(), data)
    redirect(lessonPath(id))
  })
}

export async function setLessonStatusAction(input: unknown) {
  return runAction(lessonStatusSchema, input, async ({ lessonId, status }) => {
    await requirePermission("english.write")
    await setLessonStatus(await createClient(), lessonId, status)
    refresh()
  })
}

export async function setLessonMediaAction(input: unknown) {
  return runAction(lessonMediaSchema, input, async (data) => {
    await requirePermission("english.write")
    await setLessonMedia(await createClient(), data)
    refresh()
  })
}

export async function addLessonQuestionsAction(input: unknown) {
  return runAction(lessonQuestionsSchema, input, async ({ lessonId, questionIds }) => {
    await requirePermission("english.write")
    await requirePermission("question_bank.read")
    const added = await addLessonQuestions(await createClient(), lessonId, questionIds)
    refresh()
    return added
  })
}

export async function removeLessonQuestionAction(input: unknown) {
  return runAction(lessonQuestionIdSchema, input, async ({ lessonQuestionId }) => {
    await requirePermission("english.write")
    await removeLessonQuestion(await createClient(), lessonQuestionId)
    refresh()
  })
}

// --- Students --------------------------------------------------------------

export async function recordPracticeAction(input: unknown) {
  return runAction(practiceSchema, input, async (data) => {
    await requirePermission("english.practice")
    await recordPractice(await createClient(), data)
  })
}

export async function submitLessonPracticeAction(input: unknown) {
  return runAction(lessonPracticeSchema, input, async ({ lessonId, responses }) => {
    await requirePermission("english.practice")
    const attemptId = await submitPractice(await createClient(), lessonId, responses)
    redirect(`${lessonPath(lessonId)}?attempt=${attemptId}`)
  })
}

export async function submitLessonWorkAction(input: unknown) {
  return runAction(lessonWorkSchema, input, async (data) => {
    await requirePermission("english.practice")
    const id = await submitWork(await createClient(), data)
    redirect(`${lessonSubmissionPath(id)}?submitted=1`)
  })
}

// --- Teachers --------------------------------------------------------------

export async function reviewSubmissionAction(input: unknown) {
  return runAction(reviewSchema, input, async (data) => {
    await requirePermission("english.review")
    await reviewSubmission(await createClient(), data)
    refresh()
  })
}

export async function archiveLessonAction(input: unknown) {
  return runAction(lessonIdSchema, input, async ({ lessonId }) => {
    await requirePermission("english.write")
    await setLessonStatus(await createClient(), lessonId, "archived")
    redirect(routes.lessons)
  })
}
