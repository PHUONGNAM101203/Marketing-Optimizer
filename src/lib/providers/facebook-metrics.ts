import 'server-only'

import type { MetricsAdapter } from './metrics-types'

/**
 * Facebook Page — nội dung hữu cơ (KHÁC `meta-ads`, xem `meta-metrics.ts`).
 * CÙNG Graph API v25.0 với Instagram (`instagramMetricsAdapter`) nên có
 * `period=day` THẬT — không phải snapshot như TikTok Display API (xem ghi
 * chú `SNAPSHOT_PROVIDERS` ở `data/site-channels.ts`).
 *
 * `page_impressions` ĐÃ BỎ (15/11/2025) — xử lý ở lần sửa trước (8/2026).
 *
 * `page_engaged_users` CŨNG ĐÃ BỎ — đợt khai tử THỨ HAI, hiệu lực 15/6/2026
 * (đã qua), cùng blog Meta nêu trên: "a number of Page Insights metrics will
 * be deprecated for all API versions" kể từ mốc đó — request gộp cả hai
 * metric bị Graph API từ chối nguyên request (HTTP 400 `#100 The value must
 * be a valid insights metric`), lặp lại đúng kiểu lỗi của `page_impressions`
 * trước đây. XÁC MINH lại 17/8/2026 bằng cách đọc thẳng bảng metric hiện
 * hành tại developers.facebook.com/docs/graph-api/reference/insights/ —
 * `page_engaged_users` KHÔNG còn xuất hiện trong bảng đó, trong khi
 * `page_post_engagements` vẫn còn nguyên (period day/week/days_28). KHÔNG có
 * metric thay thế nào được Meta nêu đích danh cho "engaged users" ở cấp
 * `period=day` (chỉ có `page_lifetime_engaged_followers_unique`, vốn là
 * snapshot lifetime/unique, không hợp với vòng lặp `period=day` đang dùng ở
 * đây) — không đoán thêm, bỏ hẳn field này thay vì tự chế một phép ánh xạ
 * chưa ai xác nhận. Mọi nơi từng đọc `extra.engagedUsers` (channel-card.tsx,
 * channel-metric.ts, channel-detail-body.tsx) đã đổi sang
 * `extra.postEngagements`.
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
    url.searchParams.set('metric', 'page_post_engagements')
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

    const byDate = new Map<string, number>()

    for (const metric of data.data ?? []) {
      if (metric.name !== 'page_post_engagements') continue
      for (const point of metric.values ?? []) {
        if (!point.end_time) continue
        byDate.set(point.end_time.slice(0, 10), point.value ?? 0)
      }
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, postEngagements]) => ({
        ...ZERO_ROW,
        date,
        extra: { postEngagements },
      }))
  },
}
