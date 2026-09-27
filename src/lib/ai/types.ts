/**
 * Provider-neutral AI interface. Features ask for structured JSON matching a
 * JSON Schema; each provider (Anthropic today) turns that into its own API.
 * Swap providers by adding an implementation and setting AI_PROVIDER.
 */

export type StructuredRequest = {
  system: string
  prompt: string
  /** Name and description of the structured result (a "tool" for Anthropic). */
  outputName: string
  outputDescription: string
  /** JSON Schema of the expected object. The result is still validated by the caller. */
  schema: Record<string, unknown>
  maxOutputTokens: number
  signal?: AbortSignal
}

export type StructuredResponse = {
  data: unknown
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface AiProvider {
  readonly name: string
  readonly model: string
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>
}

export type AiErrorCode =
  | "not_configured"
  | "auth_error"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "provider_error"
  | "bad_request"
  | "empty_response"
  | "truncated"
  | "invalid_output"

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "The AI assistant is not set up on this server yet (no AI provider key). Ask an administrator.",
  auth_error: "The AI provider rejected the server's key. Ask an administrator to check the AI settings.",
  rate_limited: "The AI provider is busy with too many requests right now. Please try again in a minute.",
  overloaded: "The AI provider is overloaded at the moment. Please try again shortly.",
  timeout: "The AI took too long to answer. Please try again, perhaps with a shorter lesson.",
  provider_error: "The AI provider had a problem. Please try again.",
  bad_request: "The AI provider could not process this request. Try shortening your topic or objective.",
  empty_response: "The AI returned an empty answer. Please try again.",
  truncated: "The AI's answer was cut off before it finished. Try a shorter lesson or fewer items.",
  invalid_output: "The AI's answer did not have the expected structure, even after a second attempt. Please try again.",
}

/** A failure with a code the app can act on and a message a teacher can read. */
export class AiError extends Error {
  readonly code: AiErrorCode
  readonly retryAfterMs: number | null
  readonly retryable: boolean

  constructor(code: AiErrorCode, detail?: string, options: { retryAfterMs?: number | null; cause?: unknown } = {}) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code], { cause: options.cause })
    this.name = "AiError"
    this.code = code
    this.retryAfterMs = options.retryAfterMs ?? null
    this.retryable = code === "rate_limited" || code === "overloaded" || code === "timeout" || code === "provider_error"
  }

  get userMessage() {
    return MESSAGES[this.code]
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError
}
