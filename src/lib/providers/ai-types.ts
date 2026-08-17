import 'server-only'

/**
 * Hình dạng chung cho cả 3 nhà cung cấp AI (Claude/OpenAI/Gemini) — mỗi
 * adapter (`anthropic.ts`/`openai.ts`/`gemini.ts`) dịch hình dạng riêng của
 * SDK hãng đó SANG/TỪ những type này. `run-agent.ts`/`actions/prompts.ts`
 * chỉ bao giờ thấy `AiMessage`/`AiContentPart` — không bao giờ thấy type SDK
 * riêng của một hãng nào.
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export type AiContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool-use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | {
      readonly type: 'tool-result'
      readonly toolUseId: string
      // Gemini CÓ id gọi tool riêng (FunctionCall.id/FunctionResponse.id) và
      // gemini.ts ưu tiên dùng khi có — nhưng Gemini không LUÔN trả về id đó
      // (có trường hợp bỏ trống), lúc đó phải rơi về khớp bằng TÊN. `name` ở
      // đây tồn tại cho đúng nhánh dự phòng này, để `gemini.ts` không phải
      // tra ngược lại tool-use part gốc để tìm tên khi cần fallback.
      readonly name: string
      readonly content: string
    }

export interface AiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: readonly AiContentPart[]
}

export interface AiToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other'

export interface AiCallResult {
  readonly content: readonly AiContentPart[]
  readonly stopReason: AiStopReason
  readonly tokensIn: number
  readonly tokensOut: number
  readonly model: string
}

export interface AiCallParams {
  readonly apiKey: string
  readonly model: string
  readonly systemPrompt: string
  readonly messages: readonly AiMessage[]
  readonly tools?: readonly AiToolDefinition[]
  readonly maxTokens?: number
}
