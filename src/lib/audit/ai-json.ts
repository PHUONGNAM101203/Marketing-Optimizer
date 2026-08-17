import 'server-only'

import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'

/** Model rất hay bọc JSON trong ```` ```json ... ``` ```` dù system prompt đã
 * dặn không làm vậy — xác nhận qua lượt gọi thật (Claude Sonnet 5, 8/2026),
 * không phải suy đoán (xem `computeGlobalKeywordSuggestions`, nơi phát hiện
 * ra lần đầu). Strip trước khi `JSON.parse` thay vì chỉ dặn suông trong
 * prompt, vì dặn suông đã KHÔNG đủ hiệu lực trên thực tế. */
const stripCodeFence = (text: string): string => text.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim()

export interface AiJsonResult<T> {
  /** `'ai'` khi model thật sự sinh được và qua được `validate` — `'template'`
   * khi thiếu key AI, gọi lỗi, hoặc JSON trả về không hợp lệ/không đạt
   * `validate`. Nơi gọi PHẢI đọc field này, không claim "AI sinh" cho nội
   * dung template. */
  readonly source: 'ai' | 'template'
  readonly data: T
}

/**
 * Gọi AI sinh JSON có kiểm tra hình dạng, tự rơi về `templateFallback` khi
 * thiếu key/gọi lỗi/JSON sai hình dạng — dùng chung cho mọi tính năng "AI
 * sinh gợi ý, có fallback template" trong audit (từ khoá toàn cầu, prompt
 * mẫu, agent gợi ý…), tránh viết lại 3 lần cùng một lớp fence-stripping/
 * parse/log lỗi. KHÔNG throw — lỗi ở đây không được làm hỏng lượt quét audit
 * đang gọi nó cho nhiều việc khác cùng lúc.
 */
export const callAiForJson = async <T>(
  siteId: string,
  params: { readonly systemPrompt: string; readonly userText: string },
  templateFallback: T,
  validate: (parsed: unknown) => T | null,
): Promise<AiJsonResult<T>> => {
  const aiConfig = await resolveAiConfig(siteId)
  if (!aiConfig) return { source: 'template', data: templateFallback }

  try {
    const result = await callAi({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      systemPrompt: params.systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: params.userText }] }],
    })

    const rawText = stripCodeFence(extractText(result))
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch (parseError) {
      // LỖI THẬT (model trả về không đúng định dạng dù đã strip fence) — log
      // để còn biết mà chỉnh prompt, khác "chưa cấu hình key" (nhánh trên,
      // không log vì đó là trạng thái bình thường).
      console.error(
        `Không parse được JSON từ AI (site ${siteId}): ${parseError instanceof Error ? parseError.message : String(parseError)} — raw: ${rawText.slice(0, 200)}`,
      )
      return { source: 'template', data: templateFallback }
    }

    const validated = validate(parsed)
    return validated !== null ? { source: 'ai', data: validated } : { source: 'template', data: templateFallback }
  } catch (error) {
    console.error(`Không gọi được AI (site ${siteId}): ${error instanceof Error ? error.message : String(error)}`)
    return { source: 'template', data: templateFallback }
  }
}

/** Câu dặn ngôn ngữ dùng chung — mọi prompt gọi qua `callAiForJson` nên nối
 * câu này vào cuối system prompt của mình. Site có nội dung không phải tiếng
 * Việt (vd. armywear.dk tiếng Đan Mạch) khiến model trả lời đúng ngôn ngữ
 * NGUỒN thay vì tiếng Việt nếu không dặn rõ — xác nhận qua lượt gọi thật. */
export const VIETNAMESE_OUTPUT_INSTRUCTION =
  'LUÔN viết bằng tiếng Việt, kể cả khi mô tả/từ khoá đầu vào ở ngôn ngữ khác — người đọc kết quả dùng tiếng Việt.'
