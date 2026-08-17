import 'server-only'

import OpenAI from 'openai'
import type { AiCallParams, AiCallResult, AiContentPart, AiMessage, AiStopReason } from './ai-types'

/**
 * Dùng Responses API (`client.responses.create`), KHÔNG dùng Chat Completions
 * cũ — OpenAI khuyến nghị Responses cho mọi tích hợp mới kể từ khi có
 * function-calling agentic tốt hơn và cache tốt hơn (xác nhận qua doc chính
 * thức, 8/2026: developers.openai.com/api/docs/guides/migrate-to-responses).
 * Chat Completions KHÔNG bị deprecated nhưng không còn nhận tính năng mới.
 */

const clientsByApiKey = new Map<string, OpenAI>()

const getClient = (apiKey: string): OpenAI => {
  const cached = clientsByApiKey.get(apiKey)
  if (cached) return cached
  const client = new OpenAI({ apiKey })
  clientsByApiKey.set(apiKey, client)
  return client
}

/**
 * OpenAI KHÔNG lồng tool-use/tool-result vào bên trong một "message" như
 * Anthropic/Gemini — mỗi phần là một item NGANG HÀNG trong mảng `input`
 * (`function_call`/`function_call_output`), nên một `AiMessage` có thể mở ra
 * NHIỀU input item, không phải 1-đổi-1.
 */
const toOpenAiInput = (messages: readonly AiMessage[]): OpenAI.Responses.ResponseInputItem[] => {
  const items: OpenAI.Responses.ResponseInputItem[] = []
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type === 'text') {
        items.push({ role: message.role, content: part.text })
      } else if (part.type === 'tool-use') {
        items.push({ type: 'function_call', call_id: part.id, name: part.name, arguments: JSON.stringify(part.input) })
      } else {
        items.push({ type: 'function_call_output', call_id: part.toolUseId, output: part.content })
      }
    }
  }
  return items
}

const fromOpenAiOutput = (response: OpenAI.Responses.Response): readonly AiContentPart[] => {
  const parts: AiContentPart[] = []
  if (response.output_text) parts.push({ type: 'text', text: response.output_text })
  for (const item of response.output) {
    if (item.type === 'function_call') {
      parts.push({
        type: 'tool-use',
        id: item.call_id,
        name: item.name,
        input: JSON.parse(item.arguments) as Record<string, unknown>,
      })
    }
  }
  return parts
}

export const callOpenAi = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const response = await client.responses.create({
    model: params.model,
    instructions: params.systemPrompt,
    input: toOpenAiInput(params.messages),
    tools: params.tools?.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      // `strict` là field bắt buộc trong type SDK thật (khác brief gốc, xem
      // báo cáo Task 5). Để `null` chứ không phải `false`: theo doc OpenAI
      // (developers.openai.com/api/docs/guides/function-calling), khi
      // `strict` là `null`/omitted, hệ thống TỰ ĐỘNG chuẩn hoá schema sang
      // dạng strict-compatible nếu có thể, và chỉ rơi về non-strict khi
      // không chuẩn hoá được — tức là vẫn có cùng lưới an toàn (không bao
      // giờ bị từ chối vì schema của `AiToolDefinition.inputSchema` không
      // tuân thủ strict), NHƯNG những tool có schema đã đủ điều kiện strict
      // vẫn được hưởng lợi ích đối số bám sát schema (structured outputs).
      // `false` sẽ khoá cứng mọi tool vào non-strict vô điều kiện, bỏ lỡ lợi
      // ích đó một cách không cần thiết.
      strict: null,
    })),
    max_output_tokens: params.maxTokens ?? 8000,
  })

  const content = fromOpenAiOutput(response)
  const hasToolUse = content.some((part) => part.type === 'tool-use')

  // Responses API không có field kiểu `finish_reason` — `response.status` là
  // thứ gần nhất. Không có trạng thái riêng cho "muốn gọi tool": model vẫn
  // báo `status: 'completed'` khi trả về function_call, nên phát hiện việc
  // gọi tool bằng chính nội dung trả về (`hasToolUse`), không phải status.
  const stopReason: AiStopReason = hasToolUse
    ? 'tool_use'
    : response.status === 'incomplete'
      ? 'max_tokens'
      : response.status === 'completed'
        ? 'end_turn'
        : 'other'

  return {
    content,
    stopReason,
    tokensIn: response.usage?.input_tokens ?? 0,
    tokensOut: response.usage?.output_tokens ?? 0,
    model: response.model,
  }
}
