import { AiError, type AiProvider, type StructuredRequest, type StructuredResponse } from "@/lib/ai/types"

const API_URL = "https://api.anthropic.com/v1/messages"
const API_VERSION = "2023-06-01"

type Fetch = typeof fetch

/**
 * Anthropic Messages API. Structured output is requested as a single forced
 * tool call whose input must match the schema.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic"

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error("timeout")), this.timeoutMs)
    request.signal?.addEventListener("abort", () => controller.abort(request.signal?.reason))
    let response: Response
    try {
      response = await this.fetchImpl(API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": API_VERSION },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
          tools: [{ name: request.outputName, description: request.outputDescription, input_schema: request.schema }],
          tool_choice: { type: "tool", name: request.outputName },
        }),
      })
    } catch (error) {
      if (controller.signal.aborted) throw new AiError("timeout", undefined, { cause: error })
      throw new AiError("provider_error", "network error", { cause: error })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) throw await errorFromResponse(response)

    let body: AnthropicResponse
    try {
      body = (await response.json()) as AnthropicResponse
    } catch (error) {
      throw new AiError("provider_error", "unreadable response", { cause: error })
    }
    if (body.stop_reason === "max_tokens") throw new AiError("truncated")
    const block = body.content?.find((c) => c.type === "tool_use" && c.name === request.outputName)
    if (!block || block.input === undefined || block.input === null || (typeof block.input === "object" && Object.keys(block.input).length === 0)) {
      throw new AiError("empty_response")
    }
    return {
      data: block.input,
      model: body.model ?? this.model,
      usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    }
  }
}

type AnthropicResponse = {
  model?: string
  stop_reason?: string
  content?: { type: string; name?: string; input?: unknown }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function errorFromResponse(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after"))
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null
  // Never echo the provider's body to users; only the status decides.
  switch (true) {
    case response.status === 401 || response.status === 403:
      return new AiError("auth_error", `HTTP ${response.status}`)
    case response.status === 429:
      return new AiError("rate_limited", undefined, { retryAfterMs })
    case response.status === 529:
      return new AiError("overloaded", undefined, { retryAfterMs })
    case response.status === 400 || response.status === 413 || response.status === 422:
      return new AiError("bad_request", `HTTP ${response.status}`)
    case response.status === 408 || response.status === 504:
      return new AiError("timeout", `HTTP ${response.status}`)
    default:
      return new AiError("provider_error", `HTTP ${response.status}`, { retryAfterMs })
  }
}
