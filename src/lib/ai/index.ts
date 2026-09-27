import "server-only"

import { z } from "zod"

import { AnthropicProvider } from "@/lib/ai/anthropic"
import { AiError, type AiProvider } from "@/lib/ai/types"

export * from "@/lib/ai/types"

/**
 * AI configuration comes only from server environment variables (never
 * NEXT_PUBLIC_*, never the database, never the code):
 *
 *   AI_PROVIDER    "anthropic" (default) or "none" to switch the assistant off
 *   AI_API_KEY     the provider's secret key
 *   AI_MODEL       optional; defaults to DEFAULT_MODELS[provider]
 *   AI_TIMEOUT_MS  optional; per request, default 90 000
 */
const DEFAULT_MODELS = { anthropic: "claude-sonnet-5" } as const

const envSchema = z.object({
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("anthropic"),
  AI_API_KEY: z.string().trim().min(1).optional(),
  AI_MODEL: z.string().trim().min(1).max(100).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
})

export type AiStatus = { configured: true; provider: string; model: string } | { configured: false; reason: string }

export function aiStatus(env: NodeJS.ProcessEnv = process.env): AiStatus {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) return { configured: false, reason: "The AI settings are invalid." }
  const e = parsed.data
  if (e.AI_PROVIDER === "none") return { configured: false, reason: "The AI assistant is switched off on this server." }
  if (!e.AI_API_KEY) return { configured: false, reason: "No AI provider key is set on this server." }
  return { configured: true, provider: e.AI_PROVIDER, model: e.AI_MODEL ?? DEFAULT_MODELS[e.AI_PROVIDER] }
}

export function getAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success || parsed.data.AI_PROVIDER === "none" || !parsed.data.AI_API_KEY) throw new AiError("not_configured")
  const e = parsed.data
  // One provider today; add a case (and a class implementing AiProvider) for another.
  return new AnthropicProvider(e.AI_API_KEY!, e.AI_MODEL ?? DEFAULT_MODELS.anthropic, e.AI_TIMEOUT_MS)
}

type Sleep = (ms: number) => Promise<void>
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retries rate limits, overload, timeouts and server errors with exponential
 * backoff (honouring Retry-After), within a total time budget.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseDelayMs?: number; maxDelayMs?: number; budgetMs?: number; sleep?: Sleep } = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 1_000, maxDelayMs = 20_000, budgetMs = 60_000, sleep = realSleep } = opts
  let waited = 0
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof AiError) || !error.retryable || attempt >= retries) throw error
      const delay = Math.min(maxDelayMs, error.retryAfterMs ?? baseDelayMs * 2 ** attempt)
      if (waited + delay > budgetMs) throw error
      waited += delay
      await sleep(delay)
    }
  }
}
