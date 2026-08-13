import 'server-only'

import type { MetricsAdapter } from './metrics-types'

/**
 * Marketing API (Facebook Ads) và Instagram Graph API insights.
 *
 * CHƯA ai chạy thử được với App/tài khoản thật — hình dạng request/response
 * bám theo tài liệu Graph API v21.0 công khai, cần verify khi có token thật.
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

interface MetaActionValue {
  readonly action_type?: string
  readonly value?: string
}

interface MetaInsightRow {
  readonly date_start?: string
  readonly spend?: string
  readonly impressions?: string
  readonly clicks?: string
  readonly actions?: readonly MetaActionValue[]
  readonly action_values?: readonly MetaActionValue[]
}

/** Marketing API gộp mọi hành động (like/comment/purchase/lead...) chung một
 * mảng `actions` — chỉ tính "purchase" và "lead" là chuyển đổi có ý nghĩa cho
 * một trang tổng quan marketing, không cộng dồn TẤT CẢ loại action lại. */
const CONVERSION_ACTION_TYPES = new Set(['purchase', 'lead', 'offsite_conversion.fb_pixel_purchase'])

const sumConversionActions = (actions: readonly MetaActionValue[] | undefined): number =>
  (actions ?? [])
    .filter((action) => CONVERSION_ACTION_TYPES.has(action.action_type ?? ''))
    .reduce((total, action) => total + Number(action.value ?? 0), 0)

export const metaAdsMetricsAdapter: MetricsAdapter = {
  provider: 'meta-ads',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/insights`)
    url.searchParams.set('fields', 'spend,impressions,clicks,actions,action_values')
    url.searchParams.set('time_increment', '1')
    url.searchParams.set('time_range', JSON.stringify({ since: startDate, until: endDate }))
    url.searchParams.set('level', 'account')

    const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
    if (!response.ok) return []

    const data = (await response.json()) as { data?: readonly MetaInsightRow[] }

    return (data.data ?? [])
      .filter((row) => Boolean(row.date_start))
      .map((row) => ({
        ...ZERO_ROW,
        date: row.date_start as string,
        clicks: Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
        // Meta trả `spend` là chuỗi đơn vị tiền tệ chính, không phải micros.
        costMicros: Math.round(Number(row.spend ?? 0) * 1_000_000),
        conversions: sumConversionActions(row.actions),
        conversionValueMicros: Math.round(sumConversionActions(row.action_values) * 1_000_000),
      }))
  },
}

export interface MetaAdsCampaignMetricRow {
  readonly date: string
  readonly campaignName: string
  readonly impressions: number
  readonly clicks: number
  readonly costMicros: number
  readonly conversions: number
}

interface MetaCampaignInsightRow extends MetaInsightRow {
  readonly campaign_name?: string
}

/** Báo cáo theo CHIẾN DỊCH — dùng cho trang chi tiết kênh, cùng vai trò với
 * `fetchGoogleAdsCampaignMetrics`/`fetchTiktokCampaignMetrics`. */
export const fetchMetaAdsCampaignMetrics = async (
  accessToken: string,
  adAccountId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly MetaAdsCampaignMetricRow[]> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}/insights`)
  url.searchParams.set('fields', 'campaign_name,spend,impressions,clicks,actions')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set(
    'time_range',
    JSON.stringify({ since: range.startDate, until: range.endDate }),
  )
  url.searchParams.set('level', 'campaign')

  const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
  if (!response.ok) return []

  const data = (await response.json()) as { data?: readonly MetaCampaignInsightRow[] }

  return (data.data ?? [])
    .filter((row) => Boolean(row.date_start))
    .map((row) => ({
      date: row.date_start as string,
      campaignName: row.campaign_name ?? '—',
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      costMicros: Math.round(Number(row.spend ?? 0) * 1_000_000),
      conversions: sumConversionActions(row.actions),
    }))
}

interface InstagramInsightValue {
  readonly value?: number
  readonly end_time?: string
}

interface InstagramInsightMetric {
  readonly name?: string
  readonly values?: readonly InstagramInsightValue[]
}

/** Instagram không có sessions/clicks/chi phí — có reach/impressions/profile
 * views. Không có cột riêng trong `metrics_daily` cho những chỉ số đó, đi
 * vào `extra`, cùng cách YouTube xử lý views/watchTime. */
export const instagramMetricsAdapter: MetricsAdapter = {
  provider: 'instagram',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/insights`)
    url.searchParams.set('metric', 'reach,impressions,profile_views')
    url.searchParams.set('period', 'day')
    url.searchParams.set('since', startDate)
    url.searchParams.set('until', endDate)

    const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
    if (!response.ok) return []

    const data = (await response.json()) as { data?: readonly InstagramInsightMetric[] }

    const byDate = new Map<string, { reach: number; impressions: number; profileViews: number }>()

    for (const metric of data.data ?? []) {
      for (const point of metric.values ?? []) {
        if (!point.end_time) continue
        const date = point.end_time.slice(0, 10)
        const current = byDate.get(date) ?? { reach: 0, impressions: 0, profileViews: 0 }
        if (metric.name === 'reach') current.reach = point.value ?? 0
        if (metric.name === 'impressions') current.impressions = point.value ?? 0
        if (metric.name === 'profile_views') current.profileViews = point.value ?? 0
        byDate.set(date, current)
      }
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, extra]) => ({
        ...ZERO_ROW,
        date,
        extra: {
          reach: extra.reach,
          impressions: extra.impressions,
          profileViews: extra.profileViews,
        },
      }))
  },
}
