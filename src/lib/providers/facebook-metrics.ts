import 'server-only'

import type { MetricsAdapter } from './metrics-types'

/**
 * Facebook Page — nội dung hữu cơ (KHÁC `meta-ads`, xem `meta-metrics.ts`).
 * CÙNG Graph API v25.0 với Instagram (`instagramMetricsAdapter`) nên có
 * `period=day` THẬT — không phải snapshot như TikTok Display API (xem ghi
 * chú `SNAPSHOT_PROVIDERS` ở `data/site-channels.ts`).
 *
 * `page_impressions` ĐÃ BỎ (8/2026) — XÁC MINH qua blog chính thức Meta
 * (developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates),
 * KHÔNG phải research chung chung như bản trước: metric `impressions` cấp
 * Page bị khai tử từ 15/11/2025 (đã qua từ lâu tính đến giờ), gọi metric này
 * làm CẢ request `/insights` bị Graph API từ chối (không phải chỉ bỏ qua
 * riêng metric đó) — đây là lý do `metrics_daily` của Facebook trống hoàn
 * toàn dù `read_insights` đã được cấp đúng, khiến trang Tổng quan hiện mãi
 * "Đang đồng bộ...". `page_engaged_users`/`page_post_engagements` KHÔNG nằm
 * trong danh sách khai tử này (chỉ metric tên "impressions"/"page fans" bị
 * nêu đích danh) nên vẫn giữ. CHƯA xác minh được thay thế đúng cho
 * "impressions" (Meta hướng dẫn dùng metric "views" mới, tên field cụ thể
 * chưa đối chiếu được với response thật của app này — xem lịch sử commit,
 * không đoán thêm để tránh lặp lại đúng lỗi vừa sửa).
 */

const GRAPH_VERSION = 'v25.0'
const authHeader = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

const ZERO_ROW = {
  sessions: 0,
  users: 0,
  conversions: 0,
  clicks: 0,
  impressions: 0,
  costMicros: 0,
  conversionValueMicros: 0,
} as const

interface FacebookInsightValue {
  readonly value?: number
  readonly end_time?: string
}

interface FacebookInsightMetric {
  readonly name?: string
  readonly values?: readonly FacebookInsightValue[]
}

interface GraphErrorBody {
  readonly error?: { readonly message?: string }
}

export const facebookMetricsAdapter: MetricsAdapter = {
  provider: 'facebook',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/insights`)
    url.searchParams.set('metric', 'page_engaged_users,page_post_engagements')
    url.searchParams.set('period', 'day')
    url.searchParams.set('since', startDate)
    url.searchParams.set('until', endDate)

    const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
    if (!response.ok) {
      // Không throw — một platform lỗi insights không được làm hỏng phần
      // sync còn lại của connection (metrics_daily vẫn ghi 0 dòng, không
      // chặn content snapshot). Log lý do THẬT thay vì âm thầm trả rỗng —
      // đúng bài học vừa trả giá với `fetchFacebookContentExplore` (403/400
      // trước đó không rõ lý do gì, mất nhiều vòng mới root-cause được).
      const body = (await response.json().catch(() => null)) as GraphErrorBody | null
      console.error(
        `Facebook Page insights trả lỗi HTTP ${response.status}${body?.error?.message ? ` — ${body.error.message}` : ''} (page ${externalAccountId})`,
      )
      return []
    }

    const data = (await response.json()) as { data?: readonly FacebookInsightMetric[] }

    const byDate = new Map<string, { engagedUsers: number; postEngagements: number }>()

    for (const metric of data.data ?? []) {
      for (const point of metric.values ?? []) {
        if (!point.end_time) continue
        const date = point.end_time.slice(0, 10)
        const current = byDate.get(date) ?? { engagedUsers: 0, postEngagements: 0 }
        if (metric.name === 'page_engaged_users') current.engagedUsers = point.value ?? 0
        if (metric.name === 'page_post_engagements') current.postEngagements = point.value ?? 0
        byDate.set(date, current)
      }
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, extra]) => ({
        ...ZERO_ROW,
        date,
        extra: {
          engagedUsers: extra.engagedUsers,
          postEngagements: extra.postEngagements,
        },
      }))
  },
}
