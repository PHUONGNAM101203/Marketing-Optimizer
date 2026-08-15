import 'server-only'

import { deriveMetrics } from '@/lib/metrics/derive'
import { fetchGoogleAdsCampaignMetrics } from '@/lib/providers/google-ads'
import { fetchMetaAdsCampaignMetrics } from '@/lib/providers/meta-metrics'
import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Đọc SỐNG, không lưu — chưa có bảng `entities` (xem ghi chú trong
 * `google-ads-metrics.ts`). Cùng cách YouTube trending đang làm: gọi API
 * thật mỗi lần cần, không đặt thêm hạ tầng lưu trữ cho một nhu cầu (biến
 * prompt + tool đọc của agent) chưa cần lịch sử theo ngày, chỉ cần tổng
 * trong khoảng đang chọn.
 *
 * Dùng ADMIN client — `connection_secrets` không có policy nào cho vai trò
 * thường, chỉ service_role đọc được (giống hệt `sync-connection.ts`).
 */

export interface CampaignPerformance {
  readonly provider: 'google-ads' | 'meta-ads'
  readonly campaignName: string
  readonly costMicros: number
  readonly conversions: number
  readonly cpaMicros: number | null
  readonly roas: number | null
}

const aggregateByCampaign = (
  provider: 'google-ads' | 'meta-ads',
  rows: readonly { readonly campaignName: string; readonly costMicros: number; readonly conversions: number; readonly conversionValueMicros?: number }[],
): CampaignPerformance[] => {
  const byCampaign = new Map<string, { costMicros: number; conversions: number; conversionValueMicros: number }>()

  for (const row of rows) {
    const current = byCampaign.get(row.campaignName) ?? { costMicros: 0, conversions: 0, conversionValueMicros: 0 }
    byCampaign.set(row.campaignName, {
      costMicros: current.costMicros + row.costMicros,
      conversions: current.conversions + row.conversions,
      conversionValueMicros: current.conversionValueMicros + (row.conversionValueMicros ?? 0),
    })
  }

  return [...byCampaign.entries()].map(([campaignName, totals]) => {
    const derived = deriveMetrics({
      sessions: null,
      users: null,
      conversions: totals.conversions,
      clicks: null,
      impressions: null,
      costMicros: totals.costMicros,
      conversionValueMicros: totals.conversionValueMicros || null,
      // MetricTotals đòi đủ mọi AdditiveMetricKey (kể cả revenueMicros) —
      // không có nền tảng ads nào trong file này trả về doanh thu, luôn null.
      revenueMicros: null,
    })
    return {
      provider,
      campaignName,
      costMicros: totals.costMicros,
      conversions: totals.conversions,
      cpaMicros: derived.cpaMicros,
      // Meta campaign fetch không có conversion value — roas luôn null cho meta-ads,
      // không suy diễn từ đâu khác (không bịa số).
      roas: provider === 'meta-ads' ? null : derived.roas,
    }
  })
}

export const getCampaignPerformance = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<readonly CampaignPerformance[]> => {
  const admin = createAdminClient()

  const { data: connections } = await admin
    .from('connections')
    .select('id, provider, external_account_id, status')
    .eq('site_id', siteId)
    .in('provider', ['google-ads', 'meta-ads'])

  const results: CampaignPerformance[] = []

  for (const connection of connections ?? []) {
    if (connection.status === 'revoked' || connection.status === 'error') continue

    const tokenResult = await resolveAccessToken(
      admin,
      connection.id,
      siteId,
      connection.provider as 'google-ads' | 'meta-ads',
    )
    if (!tokenResult.ok) continue

    try {
      if (connection.provider === 'google-ads') {
        const developerToken = await getGoogleAdsDeveloperToken(siteId)
        if (!developerToken) continue
        const rows = await fetchGoogleAdsCampaignMetrics(
          tokenResult.accessToken,
          developerToken,
          connection.external_account_id,
          { startDate: range.start, endDate: range.end },
        )
        results.push(...aggregateByCampaign('google-ads', rows))
      } else {
        const rows = await fetchMetaAdsCampaignMetrics(
          tokenResult.accessToken,
          connection.external_account_id,
          { startDate: range.start, endDate: range.end },
        )
        results.push(...aggregateByCampaign('meta-ads', rows))
      }
    } catch (error) {
      // Một nền tảng lỗi không được chặn nền tảng còn lại — log rồi bỏ qua,
      // giống cách các adapter đồng bộ khác xử lý lỗi từng phần.
      console.error(`getCampaignPerformance: ${connection.provider} thất bại`, error)
    }
  }

  return results.sort((a, b) => b.costMicros - a.costMicros)
}
