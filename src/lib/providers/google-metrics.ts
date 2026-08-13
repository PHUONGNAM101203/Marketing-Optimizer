import 'server-only'

import type { MetricsAdapter } from './metrics-types'

/**
 * Kéo số liệu thật từ GA4 Data API và Search Console Search Analytics API.
 *
 * Tách khỏi `google.ts` (OAuth) có chủ đích — hai việc khác nhau: một bên xin
 * quyền, một bên dùng quyền đã có để lấy báo cáo. Gộp chung sẽ thành một file
 * vừa lo xác thực vừa lo dữ liệu, khó test riêng từng phần.
 */

const ZERO_ROW = {
  sessions: 0,
  users: 0,
  conversions: 0,
  clicks: 0,
  impressions: 0,
  costMicros: 0,
  conversionValueMicros: 0,
} as const

const GA4_RUN_REPORT_ENDPOINT = (property: string) =>
  `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`

/** GA4 trả ngày dạng "20260810" (không có dấu gạch) — quy về "2026-08-10". */
const ga4DateToIso = (value: string): string =>
  `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`

interface Ga4ReportRow {
  readonly dimensionValues?: readonly { readonly value?: string }[]
  readonly metricValues?: readonly { readonly value?: string }[]
}

export const ga4MetricsAdapter: MetricsAdapter = {
  provider: 'ga4',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const response = await fetch(GA4_RUN_REPORT_ENDPOINT(externalAccountId), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }],
      }),
    })
    if (!response.ok) return []

    const data = (await response.json()) as { rows?: readonly Ga4ReportRow[] }

    return (data.rows ?? [])
      .filter((row) => Boolean(row.dimensionValues?.[0]?.value))
      .map((row) => {
        const rawDate = row.dimensionValues?.[0]?.value as string
        const [sessions, users, conversions] = (row.metricValues ?? []).map((metric) =>
          Number(metric.value ?? 0),
        )

        return {
          ...ZERO_ROW,
          date: ga4DateToIso(rawDate),
          sessions: sessions ?? 0,
          users: users ?? 0,
          conversions: conversions ?? 0,
        }
      })
  },
}

const GSC_SEARCH_ANALYTICS_ENDPOINT = (siteUrl: string) =>
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

interface GscReportRow {
  readonly keys?: readonly string[]
  readonly clicks?: number
  readonly impressions?: number
}

export const gscMetricsAdapter: MetricsAdapter = {
  provider: 'gsc',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const response = await fetch(GSC_SEARCH_ANALYTICS_ENDPOINT(externalAccountId), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ startDate, endDate, dimensions: ['date'] }),
    })
    if (!response.ok) return []

    const data = (await response.json()) as { rows?: readonly GscReportRow[] }

    return (data.rows ?? [])
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({
        ...ZERO_ROW,
        date: row.keys?.[0] as string,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
      }))
  },
}

const YOUTUBE_REPORTS_ENDPOINT = 'https://youtubeanalytics.googleapis.com/v2/reports'

interface YoutubeReportResponse {
  readonly columnHeaders?: readonly { readonly name?: string }[]
  readonly rows?: readonly (readonly (string | number)[])[]
}

/**
 * YouTube không có sessions/clicks/chi phí — có views, thời lượng xem,
 * subscriber. Những chỉ số đó KHÔNG có cột riêng trong `metrics_daily`
 * (bảy cột chung chỉ hợp cho web analytics và ads), nên đi vào `extra`.
 */
export const youtubeMetricsAdapter: MetricsAdapter = {
  provider: 'youtube',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate }) {
    const metrics = ['views', 'estimatedMinutesWatched', 'subscribersGained', 'likes']
    const url = new URL(YOUTUBE_REPORTS_ENDPOINT)
    url.searchParams.set('ids', `channel==${externalAccountId}`)
    url.searchParams.set('startDate', startDate)
    url.searchParams.set('endDate', endDate)
    url.searchParams.set('dimensions', 'day')
    url.searchParams.set('metrics', metrics.join(','))

    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return []

    const data = (await response.json()) as YoutubeReportResponse
    // Cột đầu luôn là "day" (dimension) — bốn cột metric theo đúng thứ tự
    // đã xin ở `metrics` phía trên.
    return (data.rows ?? []).map((row) => ({
      ...ZERO_ROW,
      date: String(row[0]),
      extra: {
        views: Number(row[1] ?? 0),
        watchTimeMinutes: Number(row[2] ?? 0),
        subscribersGained: Number(row[3] ?? 0),
        likes: Number(row[4] ?? 0),
      },
    }))
  },
}

export const METRICS_ADAPTERS: Readonly<{
  ga4: MetricsAdapter
  gsc: MetricsAdapter
  youtube: MetricsAdapter
}> = {
  ga4: ga4MetricsAdapter,
  gsc: gscMetricsAdapter,
  youtube: youtubeMetricsAdapter,
}
