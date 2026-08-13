import 'server-only'

import type { MetricsAdapter } from './metrics-types'

/**
 * Facebook Page — nội dung hữu cơ (KHÁC `meta-ads`, xem `meta-metrics.ts`).
 * CÙNG Graph API v25.0 với Instagram (`instagramMetricsAdapter`) nên có
 * `period=day` THẬT — không phải snapshot như TikTok Display API (xem ghi
 * chú `SNAPSHOT_PROVIDERS` ở `data/site-channels.ts`).
 *
 * CHƯA ai chạy thử được với một App/Page thật — hình dạng bám theo tài liệu
 * Graph API v25.0 công khai (research 2026), cần verify khi có token thật.
 * `post_impressions` bị Meta khai tử (2025-06-15/2025-11-15) — dùng
 * `page_impressions`/`page_engaged_users` ở CẤP PAGE (chưa bị deprecate theo
 * research) thay vì cộng dồn insight từng post.
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

export const facebookMetricsAdapter: MetricsAdapter = {
  provider: 'facebook',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/insights`)
    url.searchParams.set('metric', 'page_impressions,page_engaged_users,page_post_engagements')
    url.searchParams.set('period', 'day')
    url.searchParams.set('since', startDate)
    url.searchParams.set('until', endDate)

    const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
    if (!response.ok) return []

    const data = (await response.json()) as { data?: readonly FacebookInsightMetric[] }

    const byDate = new Map<string, { impressions: number; engagedUsers: number; postEngagements: number }>()

    for (const metric of data.data ?? []) {
      for (const point of metric.values ?? []) {
        if (!point.end_time) continue
        const date = point.end_time.slice(0, 10)
        const current = byDate.get(date) ?? { impressions: 0, engagedUsers: 0, postEngagements: 0 }
        if (metric.name === 'page_impressions') current.impressions = point.value ?? 0
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
          impressions: extra.impressions,
          engagedUsers: extra.engagedUsers,
          postEngagements: extra.postEngagements,
        },
      }))
  },
}
