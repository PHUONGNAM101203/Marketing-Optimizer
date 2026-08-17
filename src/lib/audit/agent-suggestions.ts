import 'server-only'

import { callAiForJson, VIETNAMESE_OUTPUT_INSTRUCTION, type AiJsonResult } from './ai-json'
import type { SiteProfile } from '@/lib/domain/audit'
import type { AgentRole } from '@/lib/domain/agent'

/**
 * Gợi ý agent nên bật theo lĩnh vực đã nhận diện (`site-profile.ts`) — khớp
 * MẪU trên chính nhãn category, không phải một bảng riêng dễ lệch khỏi danh
 * mục thật khi category đổi. `seo-analyst` luôn được gợi ý vì hữu ích với
 * mọi lĩnh vực, không cần điều kiện. Dùng làm TEMPLATE FALLBACK cho
 * `computeAgentRoleSuggestions` bên dưới khi site chưa cấu hình AI key.
 */
export interface AgentSuggestion {
  readonly role: AgentRole
  readonly reason: string
}

export const suggestAgentRoles = (profile: SiteProfile): readonly AgentSuggestion[] => {
  if (!profile.category) return []

  const category = profile.category
  const suggestions: AgentSuggestion[] = []

  if (/Thương mại điện tử|Bán lẻ|Thời trang|Nội thất/.test(category)) {
    suggestions.push({
      role: 'ads-optimizer',
      reason: `${category} thường chạy quảng cáo bán hàng trực tiếp — agent này canh ngân sách và hiệu suất chiến dịch.`,
    })
  }

  if (/Công nghệ|Phần mềm|Giáo dục|Marketing|Dịch vụ chuyên nghiệp|Tài chính/.test(category)) {
    suggestions.push({
      role: 'content-planner',
      reason: `${category} cạnh tranh nhiều bằng nội dung/kiến thức chuyên môn — agent này lên lịch chủ đề đều đặn.`,
    })
  }

  if (/Nhà hàng|Du lịch|Bất động sản|Y tế|Nông nghiệp/.test(category)) {
    suggestions.push({
      role: 'ai-visibility-tracker',
      reason: `Người dùng thường hỏi AI gợi ý địa điểm/dịch vụ trong lĩnh vực ${category} — đáng theo dõi có được nhắc tới không.`,
    })
  }

  suggestions.push({
    role: 'seo-analyst',
    reason: 'Theo dõi thứ hạng tìm kiếm là nền tảng chung, hữu ích bất kể lĩnh vực nào.',
  })

  return suggestions
}

const VALID_ROLES: readonly AgentRole[] = [
  'ads-optimizer',
  'seo-analyst',
  'content-planner',
  'report-writer',
  'ai-visibility-tracker',
  'anomaly-watcher',
]

const SYSTEM_PROMPT = `Bạn là chuyên gia tư vấn marketing tự động hoá. Có đúng 6 loại agent hệ thống hỗ trợ: ads-optimizer (tối ưu quảng cáo), seo-analyst (phân tích SEO), content-planner (lập kế hoạch nội dung), report-writer (viết báo cáo), ai-visibility-tracker (theo dõi hiện diện AI), anomaly-watcher (canh bất thường số liệu). Dựa trên mô tả sản phẩm/dịch vụ CỤ THỂ của một site, chọn ra những agent PHÙ HỢP NHẤT (không cần chọn hết 6, không bịa thêm loại agent nào ngoài danh sách này) kèm lý do CỤ THỂ bám sát đúng sản phẩm/dịch vụ đó — không phải lý do chung chung theo tên ngành hàng.

${VIETNAMESE_OUTPUT_INSTRUCTION} Trả lời DUY NHẤT một mảng JSON các object {"role": "...", "reason": "..."}, role phải là một trong 6 giá trị trên, không kèm giải thích, không kèm markdown code fence.`

const validate = (parsed: unknown): readonly AgentSuggestion[] | null => {
  if (!Array.isArray(parsed)) return null
  const suggestions = parsed
    .filter((item): item is { role: unknown; reason: unknown } => Boolean(item) && typeof item === 'object')
    .map((item): AgentSuggestion | null => {
      const role = VALID_ROLES.find((r) => r === item.role)
      if (!role) return null
      if (typeof item.reason !== 'string' || !item.reason.trim()) return null
      return { role, reason: item.reason.trim() }
    })
    .filter((item): item is AgentSuggestion => item !== null)
  return suggestions.length > 0 ? suggestions : null
}

export type AgentRoleSuggestions = AiJsonResult<readonly AgentSuggestion[]>

/**
 * Bản AI của `suggestAgentRoles` — lý do bám sát đúng sản phẩm/dịch vụ site
 * thay vì chỉ khớp mẫu theo tên ngành hàng chung. Rơi về `suggestAgentRoles`
 * (regex-based) khi thiếu key/gọi lỗi. Cùng vòng đời
 * `computeGlobalKeywordSuggestions`/`computePromptTemplateSuggestions` —
 * tính một lần mỗi lượt quét audit.
 */
export const computeAgentRoleSuggestions = async (
  siteId: string,
  profile: SiteProfile,
): Promise<AgentRoleSuggestions> => {
  const templateFallback = suggestAgentRoles(profile)
  if (!profile.category) return { source: 'template', data: templateFallback }

  return callAiForJson(
    siteId,
    {
      systemPrompt: SYSTEM_PROMPT,
      userText: `Ngành hàng: ${profile.category}. Mô tả sản phẩm/dịch vụ cụ thể: ${profile.description ?? '(không có)'}. Từ khoá sản phẩm thật trích được: ${profile.topKeywords.join(', ') || '(không có)'}. Chọn agent phù hợp nhất cho đúng site này.`,
    },
    templateFallback,
    validate,
  )
}
