import 'server-only'

import { callAnthropic, listAnthropicModels } from './anthropic'
import { callOpenAi, listOpenAiModels } from './openai'
import { callGemini, listGeminiModels } from './gemini'
import type { AiCallParams, AiCallResult, AiContentPart, AiProvider } from './ai-types'

export type { AiProvider, AiContentPart, AiMessage, AiToolDefinition, AiCallResult } from './ai-types'

/**
 * Điểm gọi DUY NHẤT `run-agent.ts`/`actions/prompts.ts` dùng — không bao giờ
 * gọi thẳng `callAnthropic`/`callOpenAi`/`callGemini`. `latencyMs` đo Ở ĐÂY
 * (không phải trong từng adapter) để một chỗ đo thời gian bao quanh bất kỳ
 * adapter nào chạy, không lặp lại logic đo ở cả 3 file.
 */
export const callAi = async (
  params: AiCallParams & { readonly provider: AiProvider },
): Promise<AiCallResult & { readonly latencyMs: number }> => {
  const startedAt = Date.now()
  const { provider, ...rest } = params

  const result =
    provider === 'anthropic' ? await callAnthropic(rest) : provider === 'openai' ? await callOpenAi(rest) : await callGemini(rest)

  return { ...result, latencyMs: Date.now() - startedAt }
}

/** Rút text thuần từ content parts — dùng cho lượt gọi một-chiều (Chạy thử),
 * nơi không cần phân biệt part loại gì, chỉ cần câu trả lời cuối. */
export const extractText = (result: AiCallResult): string =>
  result.content
    .filter((part): part is Extract<AiContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')

/** Dùng bởi UI Cài đặt (nút "Tải danh sách model") và cron (làm mới cache) —
 * không phải đường Prompt Studio/Agents dùng để CHẠY, chỉ để LIỆT KÊ model
 * khả dụng. */
export const listAvailableModels = async (provider: AiProvider, apiKey: string): Promise<readonly string[]> => {
  if (provider === 'anthropic') return listAnthropicModels(apiKey)
  if (provider === 'openai') return listOpenAiModels(apiKey)
  return listGeminiModels(apiKey)
}
