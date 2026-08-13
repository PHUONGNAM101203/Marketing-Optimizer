import 'server-only'

import { fetchGoogleAdsCampaignMetrics } from './google-ads'
import type { DailyMetricRow, MetricsAdapter } from './metrics-types'

/**
 * Gộp báo cáo theo CHIẾN DỊCH của Google Ads thành tổng theo NGÀY — chung
 * hình dạng với mọi adapter khác trong `metrics_daily`. Chi tiết từng chiến
 * dịch (tên, hiệu suất riêng) chưa có chỗ lưu — đó là việc của bảng
 * `entities` trong kế hoạch gốc, chưa tới lượt trong bản này.
 */
export const googleAdsMetricsAdapter: MetricsAdapter = {
  provider: 'google-ads',

  async fetchDailyMetrics({ accessToken, externalAccountId, startDate, endDate, developerToken }) {
    if (!developerToken) return []

    const campaignRows = await fetchGoogleAdsCampaignMetrics(
      accessToken,
      developerToken,
      externalAccountId,
      { startDate, endDate },
    )

    const byDate = new Map<string, DailyMetricRow>()

    for (const row of campaignRows) {
      const existing = byDate.get(row.date)
      if (!existing) {
        byDate.set(row.date, {
          date: row.date,
          sessions: 0,
          users: 0,
          conversions: row.conversions,
          clicks: row.clicks,
          impressions: row.impressions,
          costMicros: row.costMicros,
          conversionValueMicros: row.conversionValueMicros,
        })
        continue
      }

      byDate.set(row.date, {
        ...existing,
        conversions: existing.conversions + row.conversions,
        clicks: existing.clicks + row.clicks,
        impressions: existing.impressions + row.impressions,
        costMicros: existing.costMicros + row.costMicros,
        conversionValueMicros: existing.conversionValueMicros + row.conversionValueMicros,
      })
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  },
}
