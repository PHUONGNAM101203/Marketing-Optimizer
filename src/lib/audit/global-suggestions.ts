import 'server-only'

import { callAiForJson, VIETNAMESE_OUTPUT_INSTRUCTION, type AiJsonResult } from './ai-json'
import { suggestPrompts, type PromptSuggestion } from './prompt-suggestions'
import type { SiteProfile } from '@/lib/domain/audit'

const SUGGESTION_COUNT = 10

const SYSTEM_PROMPT = `Bạn là chuyên gia nghiên cứu từ khoá/SEO. Liệt kê đúng các câu hỏi/từ khoá NGƯỜI DÙNG THẬT hay tìm kiếm nhất, bám sát các SẢN PHẨM/DỊCH VỤ CỤ THỂ được mô tả — không chỉ dừng ở tên ngành hàng chung chung. Dựa trên hiểu biết chung của bạn về hành vi tìm kiếm trên toàn thế giới, KHÔNG gắn với một website cụ thể nào (không nhắc tên thương hiệu trong câu hỏi). ${VIETNAMESE_OUTPUT_INSTRUCTION} Trả lời DUY NHẤT một mảng JSON các chuỗi câu hỏi/từ khoá, không kèm giải thích, không kèm markdown code fence.`

export type GlobalKeywordSuggestions = AiJsonResult<readonly PromptSuggestion[]>

const validate = (parsed: unknown): readonly PromptSuggestion[] | null => {
  if (!Array.isArray(parsed)) return null
  const suggestions = parsed
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, SUGGESTION_COUNT)
    .map((text): PromptSuggestion => ({ text: text.trim(), intent: 'informational' }))
  return suggestions.length > 0 ? suggestions : null
}

/**
 * 10 câu hỏi/từ khoá phổ biến TOÀN CẦU về chủ đề site — dựa trên kiến thức
 * huấn luyện của model, CỐ TÌNH không bật web search (khác
 * `citation-checks.ts`) và không cần site kết nối bất kỳ nguồn nào (GSC,
 * Google Ads…) — chỉ cần `SiteProfile` đã có sẵn từ chính lượt crawl, theo
 * đúng yêu cầu "hiển thị bất cứ lúc nào, không phụ thuộc kết nối". Xem
 * docs/superpowers/specs/2026-08-17-ai-citation-check-design.md.
 */
export const computeGlobalKeywordSuggestions = async (
  siteId: string,
  profile: SiteProfile,
): Promise<GlobalKeywordSuggestions> => {
  const templateFallback = suggestPrompts(profile)
  if (!profile.category) return { source: 'template', data: templateFallback }

  return callAiForJson(
    siteId,
    {
      systemPrompt: SYSTEM_PROMPT,
      userText: `Ngành hàng: ${profile.category}. Mô tả sản phẩm/dịch vụ cụ thể của một site điển hình trong ngành này: ${profile.description ?? '(không có)'}. Từ khoá sản phẩm thật trích được: ${profile.topKeywords.join(', ') || '(không có)'}. Dựa vào các sản phẩm/dịch vụ CỤ THỂ ở trên (không dừng ở tên ngành hàng chung), liệt kê ${SUGGESTION_COUNT} câu hỏi/từ khoá người dùng thật hay tìm kiếm nhất trên toàn thế giới về đúng loại sản phẩm/dịch vụ này.`,
    },
    templateFallback,
    validate,
  )
}
