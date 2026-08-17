import 'server-only'

import { callAiForJson, VIETNAMESE_OUTPUT_INSTRUCTION, type AiJsonResult } from './ai-json'
import { findUndeclaredVariables } from '@/lib/domain/prompt'
import type { PromptCategory, PromptVariable } from '@/lib/domain/prompt'
import type { SiteProfile } from '@/lib/domain/audit'

const SUGGESTION_COUNT = 4

const VALID_CATEGORIES: readonly PromptCategory[] = [
  'ad-copy',
  'seo-content',
  'analysis',
  'planning',
  'reporting',
  'email',
  'social',
  'geo',
]

/** Prompt DÙNG ĐƯỢC NGAY — có system prompt + user template thật, không chỉ
 * một ý tưởng/tên gọi (khác `PromptSuggestion` của `prompt-suggestions.ts`,
 * vốn chỉ là một câu hỏi để thêm vào "Câu hỏi theo dõi"). Biến CỐ TÌNH chỉ
 * `source: 'manual'` — để AI tự gán biến vào `metric`/`entity` (số liệu
 * thật/thực thể thật của Site) rủi ro cao tạo ra tham chiếu KHÔNG TỒN TẠI
 * trong schema thật, hỏng cả prompt lúc chạy; biến thủ công luôn an toàn,
 * người dùng đổi sang metric/entity sau khi tạo nếu muốn qua trình sửa
 * prompt bình thường. */
export interface PromptTemplateSuggestion {
  readonly name: string
  readonly description: string
  readonly category: PromptCategory
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly variables: readonly PromptVariable[]
}

const TEMPLATE_FALLBACK: readonly PromptTemplateSuggestion[] = [
  {
    name: 'Nội dung quảng cáo ngắn',
    description: 'Sinh 3 phương án nội dung quảng cáo ngắn cho một sản phẩm/chương trình khuyến mãi.',
    category: 'ad-copy',
    systemPrompt:
      'Bạn là copywriter quảng cáo. Viết ngắn gọn, có lời kêu gọi hành động rõ ràng, đúng giọng thương hiệu — không sáo rỗng, không phóng đại quá mức.',
    userTemplate: 'Viết 3 phương án nội dung quảng cáo ngắn (dưới 40 từ mỗi phương án) cho một sản phẩm/chương trình khuyến mãi đang chạy.',
    variables: [],
  },
  {
    name: 'Caption mạng xã hội',
    description: 'Sinh caption đăng mạng xã hội (Facebook/Instagram) cho một bài đăng sản phẩm.',
    category: 'social',
    systemPrompt:
      'Bạn là người quản lý mạng xã hội. Viết caption tự nhiên, gần gũi, có 2-3 hashtag liên quan — tránh giọng quảng cáo cứng nhắc.',
    userTemplate: 'Viết một caption đăng mạng xã hội giới thiệu sản phẩm, kèm 2-3 hashtag phù hợp.',
    variables: [],
  },
]

const SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế prompt AI cho marketing. Dựa trên mô tả sản phẩm/dịch vụ CỤ THỂ của một site, đề xuất các prompt AI THẬT SỰ DÙNG ĐƯỢC NGAY (không phải ý tưởng chung chung) mà đội marketing của site đó có thể chạy thường xuyên.

Mỗi prompt gồm: name (tên ngắn), description (mô tả 1 câu prompt này dùng để làm gì), category (một trong: ad-copy, seo-content, analysis, planning, reporting, email, social, geo), systemPrompt (vai trò/quy tắc cho model), userTemplate (nội dung yêu cầu thật, có thể chèn biến dạng {{ten_bien}} nếu cần cá nhân hoá mỗi lần chạy), variables (mảng {name, label, description} cho MỌI biến {{...}} xuất hiện trong userTemplate — name phải khớp CHÍNH XÁC tên biến trong template, không được để biến nào trong template mà thiếu khai báo ở đây, và ngược lại không khai báo biến không xuất hiện trong template).

${VIETNAMESE_OUTPUT_INSTRUCTION} Trả lời DUY NHẤT một mảng JSON các object đúng hình dạng trên, không kèm giải thích, không kèm markdown code fence.`

interface RawSuggestion {
  readonly name?: unknown
  readonly description?: unknown
  readonly category?: unknown
  readonly systemPrompt?: unknown
  readonly userTemplate?: unknown
  readonly variables?: unknown
}

const toVariable = (raw: unknown): PromptVariable | null => {
  if (!raw || typeof raw !== 'object') return null
  const { name, label, description } = raw as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim()) return null
  if (typeof label !== 'string' || !label.trim()) return null
  return {
    name: name.trim(),
    label: label.trim(),
    source: 'manual',
    required: true,
    defaultValue: null,
    description: typeof description === 'string' ? description.trim() : '',
  }
}

/** Chỉ nhận suggestion có template + biến khớp nhau HOÀN TOÀN — lệch (biến
 * thiếu khai báo, hoặc khai báo biến không dùng) thì `createPromptAction`
 * sẽ từ chối lúc người dùng bấm "Tạo prompt này", một lỗi khó hiểu vì họ
 * không tự gõ template. An toàn hơn nhiều nếu loại bỏ NGAY ở đây thay vì để
 * lộ ra tận lúc submit form. */
const toSuggestion = (raw: RawSuggestion): PromptTemplateSuggestion | null => {
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (typeof raw.description !== 'string' || !raw.description.trim()) return null
  if (typeof raw.systemPrompt !== 'string' || !raw.systemPrompt.trim()) return null
  if (typeof raw.userTemplate !== 'string' || !raw.userTemplate.trim()) return null
  const category = VALID_CATEGORIES.find((c) => c === raw.category) ?? 'analysis'

  const variables = (Array.isArray(raw.variables) ? raw.variables : []).map(toVariable).filter((v): v is PromptVariable => v !== null)

  if (findUndeclaredVariables(raw.userTemplate, variables).length > 0) return null
  const declaredNames = new Set(variables.map((v) => v.name))
  const usedNames = new Set(
    [...raw.userTemplate.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]),
  )
  for (const name of declaredNames) {
    if (!usedNames.has(name)) return null
  }

  return {
    name: raw.name.trim(),
    description: raw.description.trim(),
    category,
    systemPrompt: raw.systemPrompt.trim(),
    userTemplate: raw.userTemplate.trim(),
    variables,
  }
}

const validate = (parsed: unknown): readonly PromptTemplateSuggestion[] | null => {
  if (!Array.isArray(parsed)) return null
  const suggestions = parsed
    .map((item) => toSuggestion(item as RawSuggestion))
    .filter((item): item is PromptTemplateSuggestion => item !== null)
    .slice(0, SUGGESTION_COUNT)
  return suggestions.length > 0 ? suggestions : null
}

export type PromptTemplateSuggestions = AiJsonResult<readonly PromptTemplateSuggestion[]>

/**
 * Prompt mẫu DÙNG ĐƯỢC NGAY theo đúng chủ đề sản phẩm/dịch vụ của site — bấm
 * "Tạo prompt này" ở Prompt Studio là có ngay một `PromptTemplate` hoàn
 * chỉnh, không phải nghĩ từ đầu. Cùng vòng đời `computeGlobalKeywordSuggestions`
 * (tính một lần mỗi lượt quét audit, không gọi AI mỗi lần tải trang).
 */
export const computePromptTemplateSuggestions = async (
  siteId: string,
  profile: SiteProfile,
): Promise<PromptTemplateSuggestions> => {
  if (!profile.category) return { source: 'template', data: TEMPLATE_FALLBACK }

  return callAiForJson(
    siteId,
    {
      systemPrompt: SYSTEM_PROMPT,
      userText: `Ngành hàng: ${profile.category}. Mô tả sản phẩm/dịch vụ cụ thể: ${profile.description ?? '(không có)'}. Từ khoá sản phẩm thật trích được: ${profile.topKeywords.join(', ') || '(không có)'}. Tên site: ${profile.businessName ?? '(không có)'}. Đề xuất ${SUGGESTION_COUNT} prompt AI dùng được ngay, phù hợp nhất với đúng sản phẩm/dịch vụ này.`,
    },
    TEMPLATE_FALLBACK,
    validate,
  )
}
