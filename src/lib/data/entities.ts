import 'server-only'

import { deriveMetrics } from '@/lib/metrics/derive'
import { fetchGoogleAdsCampaignMetrics } from '@/lib/providers/google-ads'
import { fetchMetaAdsCampaignMetrics } from '@/lib/providers/meta-metrics'
import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDERS, isProviderId, type ProviderId } from '@/lib/domain/providers'
import { SNAPSHOT_PROVIDERS, type ChannelSummary, type ChannelTotals } from './site-channels'

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
      // Không dùng `|| null`: 0 là tín hiệu thật (chiến dịch có chi phí nhưng
      // giá trị chuyển đổi bằng 0), khác với "nền tảng không có chỉ số này".
      // `totals.conversionValueMicros` luôn được cộng dồn (seed 0), không bao
      // giờ thực sự null ở đây.
      conversionValueMicros: totals.conversionValueMicros,
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

    try {
      const tokenResult = await resolveAccessToken(
        admin,
        connection.id,
        siteId,
        connection.provider as 'google-ads' | 'meta-ads',
      )
      if (!tokenResult.ok) continue

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

/**
 * Bản sao CỐ Ý của `getChannelSummaries` (`src/lib/data/site-channels.ts`),
 * dùng ADMIN client thay vì client phiên người dùng.
 *
 * `query-metrics`/`compare-periods` (`src/lib/agents/tools.ts`) chỉ chạy
 * trong `after()`/cron của agent (`run-agent.ts`) — không có phiên người
 * dùng, cùng lý do `getCampaignPerformance` ở trên đã dùng admin client từ
 * đầu. Bản gốc dùng `createClient()` đọc cookie qua `next/headers`, đúng cho
 * nơi có phiên (trang Kênh) nhưng vỡ trong `after()`.
 *
 * KHÔNG sửa LOGIC của `site-channels.ts` — hàm gốc vẫn đúng và cần giữ
 * nguyên cho các nơi gọi khác (trang Tổng quan, trang Kênh). Logic gộp số
 * liệu ở đây PHẢI khớp Y HỆT bản gốc, chỉ đổi client — sửa một bản thì nhớ
 * đối chiếu bản kia. (`SNAPSHOT_PROVIDERS` — hằng số, không phải logic — đã
 * export ra dùng chung, không còn là bản sao riêng ở file này.)
 */

const agentSummaryToIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const agentSummarySnapshotUpperBound = (rangeEnd: string): string => {
  const todayIso = agentSummaryToIsoDate(new Date())
  return rangeEnd >= todayIso ? rangeEnd : todayIso
}

const AGENT_SUMMARY_EMPTY_TOTALS: ChannelTotals = {
  sessions: 0,
  users: 0,
  conversions: 0,
  clicks: 0,
  impressions: 0,
  costMicros: 0,
  conversionValueMicros: 0,
}

export const getChannelSummariesForAgent = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<ReadonlyMap<ProviderId, ChannelSummary>> => {
  const admin = createAdminClient()

  const { data: connections } = await admin.from('connections').select('id, provider').eq('site_id', siteId)

  const connectionsByProvider = new Map<ProviderId, string[]>()
  const connectionIdToProvider = new Map<string, ProviderId>()
  const snapshotConnectionIds: string[] = []
  const regularConnectionIds: string[] = []

  for (const row of connections ?? []) {
    if (!isProviderId(row.provider)) continue
    const ids = connectionsByProvider.get(row.provider) ?? []
    ids.push(row.id)
    connectionsByProvider.set(row.provider, ids)
    connectionIdToProvider.set(row.id, row.provider)
    if (SNAPSHOT_PROVIDERS.has(row.provider)) snapshotConnectionIds.push(row.id)
    else regularConnectionIds.push(row.id)
  }

  const METRICS_COLUMNS =
    'connection_id, date, sessions, users, conversions, clicks, impressions, cost_micros, conversion_value_micros, extra'

  const [{ data: regularRows }, { data: snapshotRows }] = await Promise.all([
    regularConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from('metrics_daily')
          .select(METRICS_COLUMNS)
          .in('connection_id', regularConnectionIds)
          .gte('date', range.start)
          .lte('date', range.end),
    snapshotConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from('metrics_daily')
          .select(METRICS_COLUMNS)
          .in('connection_id', snapshotConnectionIds)
          .gte('date', range.start)
          .lte('date', agentSummarySnapshotUpperBound(range.end)),
  ])
  const metricsRows = [...(regularRows ?? []), ...(snapshotRows ?? [])]

  const summaries = new Map<ProviderId, ChannelSummary>()
  const latestSnapshotDate = new Map<ProviderId, string>()

  for (const provider of PROVIDERS) {
    const connected = (connectionsByProvider.get(provider)?.length ?? 0) > 0
    summaries.set(provider, {
      provider,
      connected,
      hasData: false,
      totals: AGENT_SUMMARY_EMPTY_TOTALS,
      extra: {},
    })
  }

  for (const row of metricsRows) {
    const provider = connectionIdToProvider.get(row.connection_id)
    if (!provider) continue

    const current = summaries.get(provider) as ChannelSummary
    const extra = (row.extra ?? {}) as Record<string, number>

    // Merchant Center (và bất kỳ nền tảng nào khác về sau lưu SNAPSHOT thay
    // vì chỉ số cộng dồn) không được CỘNG `extra` qua nhiều ngày — mỗi hàng
    // là trạng thái TẠI THỜI ĐIỂM đó, cộng nhiều ngày lại nhân sai con số.
    // Chỉ giữ hàng có `date` MỚI NHẤT trong khoảng đang chọn.
    const isSnapshot = SNAPSHOT_PROVIDERS.has(provider)
    let mergedExtra: Record<string, number>
    if (isSnapshot) {
      const seenDate = latestSnapshotDate.get(provider)
      if (seenDate && seenDate >= row.date) continue
      latestSnapshotDate.set(provider, row.date)
      mergedExtra = { ...extra }
    } else {
      mergedExtra = { ...current.extra }
      for (const [key, value] of Object.entries(extra)) {
        mergedExtra[key] = (mergedExtra[key] ?? 0) + (Number(value) || 0)
      }
    }

    summaries.set(provider, {
      ...current,
      hasData: true,
      totals: {
        sessions: current.totals.sessions + row.sessions,
        users: current.totals.users + row.users,
        conversions: current.totals.conversions + row.conversions,
        clicks: current.totals.clicks + row.clicks,
        impressions: current.totals.impressions + row.impressions,
        costMicros: current.totals.costMicros + row.cost_micros,
        conversionValueMicros: current.totals.conversionValueMicros + row.conversion_value_micros,
      },
      extra: mergedExtra,
    })
  }

  return summaries
}
