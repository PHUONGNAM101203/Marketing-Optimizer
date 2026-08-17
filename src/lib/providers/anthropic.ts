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
 * Web search GỐC của Anthropic — chạy phía SERVER Anthropic trong CÙNG lượt
 * gọi, không phải tool tự định nghĩa cần round-trip (khác `tools` bên dưới).
 * `20260318` là bản mới nhất SDK khai (`WebSearchTool20260318`,
 * `@anthropic-ai/sdk` đã cài) tính tới 8/2026 — dùng bản mới nhất thay vì
 * `20250305` cũ hơn cũng có trong SDK.
 *
 * CHƯA ai chạy thử với key thật — cú pháp bám theo type khai trong SDK
 * (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`,
 * `WebSearchTool20260318`), cần verify khi có lượt gọi kiểm tra trích dẫn
 * thật đầu tiên.
 */
const ANTHROPIC_WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260318 = {
  type: 'web_search_20260318',
  name: 'web_search',
}

/**
 * Adapter cho lớp trừu tượng đa nhà cung cấp (`providers/ai.ts`) — dịch
 * `AiMessage`/`AiToolDefinition` sang hình dạng SDK Anthropic thật, và
 * `Anthropic.Message` ngược lại thành `AiCallResult`. Dùng lại đúng
 * `getClient`/`clientsByApiKey` đã có sẵn ở trên, không dựng client riêng.
 */
export const callAnthropic = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const customTools: readonly Anthropic.ToolUnion[] =
    params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    })) ?? []
  const tools: readonly Anthropic.ToolUnion[] = params.enableWebSearch
    ? [...customTools, ANTHROPIC_WEB_SEARCH_TOOL]
    : customTools

  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens ?? 8000,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
    tools: tools.length > 0 ? [...tools] : undefined,
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
