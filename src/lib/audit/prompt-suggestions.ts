import 'server-only'

import type { SiteProfile } from '@/lib/domain/audit'
import type { PromptIntent } from '@/lib/domain/geo'

/**
 * Gợi ý câu hỏi theo dõi — sinh bằng MẪU CÂU + từ khoá thật đã trích từ nội
 * dung site (`site-profile.ts`), không gọi AI nào. Cùng mức độ trung thực
 * với phần "hồ sơ website": rõ ràng đây là gợi ý mẫu để người dùng CHỈNH SỬA
 * lại cho đúng giọng thương hiệu, không phải câu hỏi AI "hiểu" ngữ cảnh viết ra.
 */
export interface PromptSuggestion {
  readonly text: string
  readonly intent: PromptIntent
}

export const suggestPrompts = (profile: SiteProfile): readonly PromptSuggestion[] => {
  if (!profile.category) return []

  const keyword = profile.topKeywords[0] ?? profile.category.toLowerCase()
  const name = profile.businessName ?? 'thương hiệu này'

  return [
    { text: `${profile.category} nào tốt nhất hiện nay nên chọn?`, intent: 'recommendation' },
    { text: `${keyword} uy tín nên tìm ở đâu?`, intent: 'informational' },
    { text: `${name} có đáng tin cậy không?`, intent: 'comparison' },
    { text: `Nên chọn ${keyword} nào phù hợp nhất với nhu cầu của tôi?`, intent: 'transactional' },
  ]
}
