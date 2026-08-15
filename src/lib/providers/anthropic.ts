import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * Gọi Claude qua stream rồi gom lại thành message hoàn chỉnh — không gọi
 * `.create()` trực tiếp. `.create()` không-stream có nguy cơ chạm timeout
 * HTTP của SDK với output dài; ở đây chưa cần render từng token ra UI (Chạy
 * thử trả nguyên khối, agent loop xử lý nội bộ), nên stream chỉ để tránh
 * timeout, không để hiện tiến trình.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

let cachedClient: Anthropic | null = null

const getClient = (): Anthropic => {
  if (cachedClient) return cachedClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Thiếu biến môi trường ANTHROPIC_API_KEY')
  cachedClient = new Anthropic({ apiKey })
  return cachedClient
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
  readonly systemPrompt: string
  readonly messages: readonly ClaudeMessage[]
  readonly model?: string
  readonly tools?: readonly ClaudeToolDefinition[]
  readonly maxTokens?: number
}): Promise<{ readonly message: Anthropic.Message; readonly latencyMs: number }> => {
  const client = getClient()
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
