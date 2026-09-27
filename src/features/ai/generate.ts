import { describeIssues, lessonPlanSchema, planProblems, type GenerationInput, type LessonPlan } from "@/features/ai/content"
import { buildPrompt, buildRepairPrompt, OUTPUT_NAME, OUTPUT_SCHEMA, SYSTEM_PROMPT } from "@/features/ai/prompts"
import { AiError, type AiProvider } from "@/lib/ai/types"

export type GenerationResult = {
  plan: LessonPlan
  model: string
  attempts: number
  usage: { inputTokens: number; outputTokens: number }
}

type Options = {
  /** Wraps each provider call (retries in production; identity in tests). */
  retry?: <T>(fn: () => Promise<T>) => Promise<T>
  maxOutputTokens?: number
}

/**
 * Asks the provider for a lesson plan and validates it. An answer with the
 * wrong structure or missing required parts gets exactly one corrective
 * retry; after that the request fails with "invalid_output". Nothing is saved
 * here — the caller stores only a plan that passed validation.
 */
export async function generateLessonPlan(provider: AiProvider, input: GenerationInput, opts: Options = {}): Promise<GenerationResult> {
  const retry = opts.retry ?? ((fn) => fn())
  const usage = { inputTokens: 0, outputTokens: 0 }
  let prompt = buildPrompt(input)
  let model = provider.model
  let lastProblems: string[] = []

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await retry(() =>
      provider.generateStructured({
        system: SYSTEM_PROMPT,
        prompt,
        outputName: OUTPUT_NAME,
        outputDescription: "Return the complete lesson plan for the teacher to review.",
        schema: OUTPUT_SCHEMA,
        maxOutputTokens: opts.maxOutputTokens ?? 8_000,
      })
    )
    usage.inputTokens += response.usage.inputTokens
    usage.outputTokens += response.usage.outputTokens
    model = response.model

    if (response.data === null || typeof response.data !== "object" || Array.isArray(response.data)) {
      lastProblems = ["The answer was not a JSON object."]
    } else {
      const parsed = lessonPlanSchema.safeParse(response.data)
      lastProblems = parsed.success ? planProblems(input.task, parsed.data, input.durationMinutes) : describeIssues(parsed.error)
      if (parsed.success && lastProblems.length === 0) return { plan: parsed.data, model, attempts: attempt, usage }
    }
    prompt = buildRepairPrompt(input, response.data, lastProblems)
  }
  throw new AiError("invalid_output", lastProblems.slice(0, 2).join(" "))
}
