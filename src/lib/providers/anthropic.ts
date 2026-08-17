import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import type { AiCallParams, AiCallResult, AiContentPart, AiStopReason } from './ai-types'

/**
 * Gọi Claude qua stream rồi gom lại thành message hoàn chỉnh — không gọi
 * `.create()` trực tiếp. `.create()` không-stream có nguy cơ chạm timeout
 * HTTP của SDK với output dài; ở đây chưa cần render từng token ra UI (Chạy
 * thử trả nguyên khối, agent loop xử lý nội bộ), nên stream chỉ để tránh
 * timeout, không để hiện tiến trình.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

/**
 * Mỗi Site có thể dùng một Claude API Key riêng (xem `lib/data/site-ai-keys.ts`)
 * nên không còn một client singleton dùng chung — cache theo khoá key để các
 * round tool-calling liên tiếp trong CÙNG một lượt chạy (cùng site, cùng key)
 * không dựng lại SDK client mỗi lần gọi. Map đơn giản là đủ: số key phân biệt
 * trong một tiến trình server nhỏ (một Site một key), không có đường xoá key
 * cũ khỏi Site đang chạy nên không cần TTL/giới hạn kích thước — nếu sau này
 * số Site tự cấu hình key lớn tới mức đáng lo bộ nhớ thì đổi sang LRU, chưa
 * cần ở quy mô hiện tại.
 */
const clientsByApiKey = new Map<string, Anthropic>()

const getClient = (apiKey: string): Anthropic => {
  const cached = clientsByApiKey.get(apiKey)
  if (cached) return cached
  const client = new Anthropic({ apiKey })
  clientsByApiKey.set(apiKey, client)
  return client
}

export interface ClaudeToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export interface ClaudeMessage {
  readonly role: 'user' | 'assistant'
  readonly content: Anthropic.MessageParam['content']
}

export const callClaude = async (params: {
  readonly apiKey: string
  readonly systemPrompt: string
  readonly messages: readonly ClaudeMessage[]
  readonly model?: string
  readonly tools?: readonly ClaudeToolDefinition[]
  readonly maxTokens?: number
}): Promise<{ readonly message: Anthropic.Message; readonly latencyMs: number }> => {
  const client = getClient(params.apiKey)
  const startedAt = Date.now()

  const stream = client.messages.stream({
    model: params.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: params.maxTokens ?? 8000,
    system: params.systemPrompt,
    messages: params.messages as Anthropic.MessageParam[],
    tools: params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    })),
  })

  const message = await stream.finalMessage()
  return { message, latencyMs: Date.now() - startedAt }
}

/** Rút text thuần từ content blocks — dùng cho lượt gọi một-chiều (Chạy thử),
 * nơi không cần phân biệt block loại gì, chỉ cần câu trả lời cuối. */
export const extractText = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

const toAnthropicContent = (parts: readonly AiContentPart[]): Anthropic.MessageParam['content'] =>
  parts.map((part) => {
    if (part.type === 'text') return { type: 'text' as const, text: part.text }
    if (part.type === 'tool-use') return { type: 'tool_use' as const, id: part.id, name: part.name, input: part.input }
    return { type: 'tool_result' as const, tool_use_id: part.toolUseId, content: part.content }
  })

const fromAnthropicContent = (content: Anthropic.Message['content']): readonly AiContentPart[] =>
  content
    .filter(
      (block): block is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
        block.type === 'text' || block.type === 'tool_use',
    )
    .map((block): AiContentPart =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool-use', id: block.id, name: block.name, input: block.input as Record<string, unknown> },
    )

const STOP_REASON_MAP: Readonly<Record<string, AiStopReason>> = {
  end_turn: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
}

/**
 * Adapter cho lớp trừu tượng đa nhà cung cấp (`providers/ai.ts`) — dịch
 * `AiMessage`/`AiToolDefinition` sang hình dạng SDK Anthropic thật, và
 * `Anthropic.Message` ngược lại thành `AiCallResult`. Dùng lại đúng
 * `getClient`/`clientsByApiKey` đã có sẵn ở trên, không dựng client riêng.
 */
export const callAnthropic = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens ?? 8000,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
    tools: params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    })),
  })

  const message = await stream.finalMessage()

  return {
    content: fromAnthropicContent(message.content),
    stopReason: STOP_REASON_MAP[message.stop_reason ?? ''] ?? 'other',
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
    model: message.model,
  }
}
