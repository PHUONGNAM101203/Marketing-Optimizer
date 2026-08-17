import 'server-only'

import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
import { suggestPrompts, type PromptSuggestion } from './prompt-suggestions'
import type { SiteProfile } from '@/lib/domain/audit'

const SUGGESTION_COUNT = 10

const SYSTEM_PROMPT =
  'Bạn là chuyên gia nghiên cứu từ khoá/SEO. Liệt kê đúng các câu hỏi/từ khoá NGƯỜI DÙNG THẬT hay tìm kiếm nhất về một chủ đề — dựa trên hiểu biết chung của bạn về hành vi tìm kiếm trên toàn thế giới, KHÔNG gắn với một website cụ thể nào. Trả lời DUY NHẤT một mảng JSON các chuỗi câu hỏi/từ khoá, không kèm giải thích, không kèm markdown code fence.'

/**
 * 10 câu hỏi/từ khoá phổ biến TOÀN CẦU về chủ đề site — dựa trên kiến thức
 * huấn luyện của model, CỐ TÌNH không bật web search (khác
 * `citation-checks.ts`) và không cần site kết nối bất kỳ nguồn nào (GSC,
 * Google Ads…) — chỉ cần `SiteProfile` đã có sẵn từ chính lượt crawl, theo
 * đúng yêu cầu "hiển thị bất cứ lúc nào, không phụ thuộc kết nối". Xem
 * docs/superpowers/specs/2026-08-17-ai-citation-check-design.md.
 *
 * KHÔNG throw — lỗi ở đây (thiếu key, gọi API lỗi, JSON trả về không hợp lệ)
 * rơi về `suggestPrompts()` template, không được làm hỏng cả lượt quét audit
 * vốn còn phải ghi SEO/GEO/AIO/AEO score dù phần này lỗi.
 */
export const computeGlobalKeywordSuggestions = async (
  siteId: string,
  profile: SiteProfile,
): Promise<readonly PromptSuggestion[]> => {
  const templateFallback = suggestPrompts(profile)
  if (!profile.category) return templateFallback

  const aiConfig = await resolveAiConfig(siteId)
  if (!aiConfig) return templateFallback

  try {
    const result = await callAi({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Chủ đề: ${profile.category}. Mô tả: ${profile.description ?? '(không có)'}. Từ khoá đã biết: ${profile.topKeywords.join(', ') || '(không có)'}. Liệt kê ${SUGGESTION_COUNT} câu hỏi/từ khoá được tìm kiếm nhiều nhất về chủ đề này trên toàn thế giới.`,
            },
          ],
        },
      ],
    })

    const parsed = JSON.parse(extractText(result).trim()) as unknown
    if (!Array.isArray(parsed)) return templateFallback

    const suggestions = parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, SUGGESTION_COUNT)
      .map((text): PromptSuggestion => ({ text: text.trim(), intent: 'informational' }))

    return suggestions.length > 0 ? suggestions : templateFallback
  } catch {
    // Lỗi mạng, lỗi API, hoặc JSON.parse thất bại (model trả về không đúng
    // định dạng yêu cầu) — mọi trường hợp đều rơi về template, không log lỗi
    // ồn ào cho một tính năng tự bản chất đã có fallback graceful.
    return templateFallback
  }
}
