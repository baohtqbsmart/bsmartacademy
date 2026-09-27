import "server-only"

import { lessonPlanSchema, describeIssues, planProblems, type AiTask, type GenerationInput, type LessonPlan } from "@/features/ai/content"
import { planToDesign, planToHomework, AI_CREDIT } from "@/features/ai/convert"
import { generateLessonPlan } from "@/features/ai/generate"
import type { DesignKind } from "@/features/designer/model"
import { aiStatus, getAiProvider, isAiError, withRetry } from "@/lib/ai"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums, Json } from "@/types/database"

// Every query runs as the teacher (RLS: own drafts only). The AI is called
// from the server only, with the key from the environment; nothing the AI
// returns is stored unless it passed validation, and nothing is published.

export async function listDrafts(db: DbClient) {
  const { data, error } = await db.from("ai_drafts").select("id, task, title, status, owner_id, owner_name, model, created_at, approved_at").order("created_at", { ascending: false }).limit(100)
  if (error) throw fromPostgrestError(error)
  return data
}

export async function getDraft(db: DbClient, id: string) {
  const { data, error } = await db.from("ai_drafts").select("*").eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) return null
  const parsed = lessonPlanSchema.safeParse(data.content)
  return { ...data, plan: parsed.success ? parsed.data : null, input: data.input as unknown as GenerationInput, savedTo: (data.saved_to as { type: string; id: string }[]) ?? [] }
}

export type DraftDetail = NonNullable<Awaited<ReturnType<typeof getDraft>>>

/** Teacher input → provider → validated plan → saved draft. Usage is logged and limited per teacher. */
export async function generateDraft(db: DbClient, input: GenerationInput) {
  const status = aiStatus()
  // Checked before using a request from the teacher's allowance.
  if (!status.configured) throw new AppError("VALIDATION", `${status.reason} Ask an administrator to configure the AI assistant.`)

  const { data: requestId, error } = await db.rpc("begin_ai_request", { target_task: input.task })
  if (error) throw fromPostgrestError(error)

  const finish = (succeeded: boolean, model: string, code: string | null, usage = { inputTokens: 0, outputTokens: 0 }) =>
    db.rpc("finish_ai_request", {
      target_request: requestId,
      succeeded,
      target_provider: status.provider,
      target_model: model,
      target_error: code,
      tokens_in: usage.inputTokens,
      tokens_out: usage.outputTokens,
    })

  let result
  try {
    result = await generateLessonPlan(getAiProvider(), input, { retry: (fn) => withRetry(fn, { retries: 2, budgetMs: 45_000 }) })
  } catch (err) {
    const code = isAiError(err) ? err.code : "unexpected"
    await finish(false, status.model, code)
    // Log the code only: never prompts, answers or keys.
    console.error("[ai] generation failed", code)
    if (isAiError(err)) throw new AppError("VALIDATION", err.userMessage, { cause: err })
    throw new AppError("INTERNAL", "The AI assistant failed unexpectedly. Please try again.", { cause: err })
  }

  const { data, error: insertError } = await db
    .from("ai_drafts")
    .insert({
      task: input.task,
      title: result.plan.title,
      input: input as unknown as Json,
      content: result.plan as unknown as Json,
      provider: status.provider,
      model: result.model,
      request_id: requestId,
    })
    .select("id")
    .single()
  await finish(!insertError, result.model, insertError ? "save_failed" : null, result.usage)
  if (insertError) throw fromPostgrestError(insertError)
  return data.id
}

/** Validates an edited plan; structure errors block saving, content warnings are returned. */
export function checkPlan(task: AiTask, content: unknown, durationMinutes: number): { plan: LessonPlan; warnings: string[] } {
  const parsed = lessonPlanSchema.safeParse(content)
  if (!parsed.success) throw new AppError("VALIDATION", `The plan is not complete: ${describeIssues(parsed.error).join("; ")}`)
  return { plan: parsed.data, warnings: planProblems(task, parsed.data, durationMinutes) }
}

export async function saveDraftContent(db: DbClient, id: string, content: unknown) {
  const draft = await getDraft(db, id)
  if (!draft) throw new AppError("NOT_FOUND", "Draft not found.")
  const { plan, warnings } = checkPlan(draft.task, content, draft.input.durationMinutes)
  const { error } = await db.from("ai_drafts").update({ title: plan.title, content: plan as unknown as Json }).eq("id", id)
  if (error) throw fromPostgrestError(error)
  return warnings
}

export async function setDraftStatus(db: DbClient, id: string, status: "approved" | "discarded") {
  const draft = await getDraft(db, id)
  if (!draft) throw new AppError("NOT_FOUND", "Draft not found.")
  // Approval needs a structurally valid plan (the teacher has reviewed it).
  if (status === "approved") checkPlan(draft.task, draft.content, draft.input.durationMinutes)
  const { data, error } = await db.from("ai_drafts").update({ status }).eq("id", id).select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Draft not found, or you may not change it.")
}

const DESIGN_KIND: Record<AiTask, DesignKind> = {
  lesson: "presentation",
  worksheet: "worksheet",
  vocabulary: "vocabulary_cards",
  grammar: "grammar_activity",
  reading: "worksheet",
  listening: "presentation",
  speaking: "presentation",
  writing: "worksheet",
  differentiated: "presentation",
  homework: "worksheet",
}

async function approvedPlan(db: DbClient, id: string) {
  const draft = await getDraft(db, id)
  if (!draft) throw new AppError("NOT_FOUND", "Draft not found.")
  if (draft.status !== "approved") throw new AppError("VALIDATION", "Approve the draft before saving it to the platform.")
  const { plan } = checkPlan(draft.task, draft.content, draft.input.durationMinutes)
  return { draft, plan }
}

async function recordSaved(db: DbClient, draft: DraftDetail, item: { type: "design" | "assignment"; id: string }) {
  const { error } = await db.from("ai_drafts").update({ saved_to: [...draft.savedTo, item] as unknown as Json }).eq("id", draft.id)
  if (error) throw fromPostgrestError(error)
}

/** A private lesson design (only its teacher sees it). */
export async function saveAsDesign(db: DbClient, id: string) {
  const { draft, plan } = await approvedPlan(db, id)
  const { data, error } = await db
    .from("designs")
    .insert({ title: plan.title, kind: DESIGN_KIND[draft.task], content: planToDesign(plan, draft.input) as unknown as Json })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  await recordSaved(db, draft, { type: "design", id: data.id })
  return data.id
}

const ASSIGNMENT_SKILL: Record<GenerationInput["skill"], Enums<"assignment_skill">> = {
  mixed: "mixed",
  listening: "listening",
  reading: "reading",
  speaking: "speaking",
  writing: "writing",
  grammar: "grammar",
  vocabulary: "vocabulary",
  pronunciation: "pronunciation",
}

/** A homework assignment in DRAFT status: students see nothing until the teacher publishes it. */
export async function saveAsAssignment(db: DbClient, id: string, classId: string, reviewer: string) {
  const { draft, plan } = await approvedPlan(db, id)
  const homework = planToHomework(plan, reviewer)
  const { data, error } = await db
    .from("assignments")
    .insert({
      class_id: classId,
      title: homework.title,
      description: `${plan.summary}\n\n${AI_CREDIT}`.slice(0, 5000),
      instructions: homework.instructions,
      assignment_type: "homework",
      skill: ASSIGNMENT_SKILL[draft.input.skill],
      status: "draft",
    })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  await recordSaved(db, draft, { type: "assignment", id: data.id })
  return data.id
}

export async function listTeachableClasses(db: DbClient) {
  const { data, error } = await db.from("classes").select("id, name").is("deleted_at", null).in("status", ["planned", "active"]).order("name")
  if (error) throw fromPostgrestError(error)
  return data
}
