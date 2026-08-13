import 'server-only'

import type { SiteProfile } from '@/lib/domain/audit'
import type { AgentRole } from '@/lib/domain/agent'

/**
 * Gợi ý agent nên bật theo lĩnh vực đã nhận diện (`site-profile.ts`) — khớp
 * MẪU trên chính nhãn category, không phải một bảng riêng dễ lệch khỏi danh
 * mục thật khi category đổi. `seo-analyst` luôn được gợi ý vì hữu ích với
 * mọi lĩnh vực, không cần điều kiện.
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
