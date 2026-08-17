import 'server-only'

import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
import { suggestPrompts, type PromptSuggestion } from './prompt-suggestions'
import type { SiteProfile } from '@/lib/domain/audit'

const SUGGESTION_COUNT = 10

const SYSTEM_PROMPT =
  'Bạn là chuyên gia nghiên cứu từ khoá/SEO. Liệt kê đúng các câu hỏi/từ khoá NGƯỜI DÙNG THẬT hay tìm kiếm nhất, bám sát các SẢN PHẨM/DỊCH VỤ CỤ THỂ được mô tả — không chỉ dừng ở tên ngành hàng chung chung. Dựa trên hiểu biết chung của bạn về hành vi tìm kiếm trên toàn thế giới, KHÔNG gắn với một website cụ thể nào (không nhắc tên thương hiệu trong câu hỏi). LUÔN viết bằng tiếng Việt, kể cả khi mô tả/từ khoá đầu vào ở ngôn ngữ khác — người đọc kết quả dùng tiếng Việt. Trả lời DUY NHẤT một mảng JSON các chuỗi câu hỏi/từ khoá, không kèm giải thích, không kèm markdown code fence.'

/** Model rất hay bọc JSON trong ```` ```json ... ``` ```` dù đã dặn không làm
 * vậy trong system prompt — xác nhận qua lượt gọi thật (Claude Sonnet 5,
 * 8/2026), không phải suy đoán. Strip trước khi `JSON.parse` thay vì chỉ dặn
 * suông trong prompt, vì việc dặn suông đã KHÔNG đủ hiệu lực trên thực tế. */
const stripCodeFence = (text: string): string => text.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim()

export interface GlobalKeywordSuggestions {
  /** `'ai'` khi model thật sự sinh được — `'template'` khi rơi về
   * `suggestPrompts()` (thiếu key, gọi lỗi, hoặc JSON trả về không hợp lệ).
   * UI PHẢI đọc field này để không claim "AI sinh" cho nội dung template. */
  readonly source: 'ai' | 'template'
  readonly suggestions: readonly PromptSuggestion[]
}

const templateResult = (profile: SiteProfile): GlobalKeywordSuggestions => ({
  source: 'template',
  suggestions: suggestPrompts(profile),
})

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
): Promise<GlobalKeywordSuggestions> => {
  if (!profile.category) return templateResult(profile)

  const aiConfig = await resolveAiConfig(siteId)
  if (!aiConfig) return templateResult(profile)

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
              text: `Ngành hàng: ${profile.category}. Mô tả sản phẩm/dịch vụ cụ thể của một site điển hình trong ngành này: ${profile.description ?? '(không có)'}. Từ khoá sản phẩm thật trích được: ${profile.topKeywords.join(', ') || '(không có)'}. Dựa vào các sản phẩm/dịch vụ CỤ THỂ ở trên (không dừng ở tên ngành hàng chung), liệt kê ${SUGGESTION_COUNT} câu hỏi/từ khoá người dùng thật hay tìm kiếm nhất trên toàn thế giới về đúng loại sản phẩm/dịch vụ này.`,
            },
          ],
        },
      ],
    })

    const rawText = stripCodeFence(extractText(result))
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch (parseError) {
      // LỖI THẬT (model trả về không đúng định dạng dù đã strip fence) — log
      // để còn biết mà chỉnh prompt, khác hẳn "chưa cấu hình key" (nhánh trên,
      // không log vì đó là trạng thái bình thường, không phải lỗi).
      console.error(
        `Không parse được gợi ý từ khoá AI (site ${siteId}): ${parseError instanceof Error ? parseError.message : String(parseError)} — raw: ${rawText.slice(0, 200)}`,
      )
      return templateResult(profile)
    }
    if (!Array.isArray(parsed)) return templateResult(profile)

    const suggestions = parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, SUGGESTION_COUNT)
      .map((text): PromptSuggestion => ({ text: text.trim(), intent: 'informational' }))

    return suggestions.length > 0 ? { source: 'ai', suggestions } : templateResult(profile)
  } catch (error) {
    // Lỗi mạng/lỗi API — log cùng lý do nhánh JSON.parse ở trên, vẫn rơi về
    // template graceful, không làm hỏng cả lượt quét audit.
    console.error(
      `Không gọi được AI để sinh gợi ý từ khoá (site ${siteId}): ${error instanceof Error ? error.message : String(error)}`,
    )
    return templateResult(profile)
  }
}
