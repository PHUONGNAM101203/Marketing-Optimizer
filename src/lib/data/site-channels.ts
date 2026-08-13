import 'server-only'

import { PROVIDERS, isProviderId, type ProviderId } from '@/lib/domain/providers'
import { createClient } from '@/lib/supabase/server'

export interface ChannelTotals {
  readonly sessions: number
  readonly users: number
  readonly conversions: number
  readonly clicks: number
  readonly impressions: number
  readonly costMicros: number
  readonly conversionValueMicros: number
}

export interface ChannelSummary {
  readonly provider: ProviderId
  /** Site có connection cho nền tảng này (bất kể có số liệu hay chưa). */
  readonly connected: boolean
  /** Có ít nhất một hàng metrics_daily thật — khác `connected`: GTM luôn
   * connected=true nhưng hasData=false mãi mãi, nó không có metrics. */
  readonly hasData: boolean
  readonly totals: ChannelTotals
  /** Gộp cộng dồn cột `extra` (jsonb) qua mọi ngày — vd. views/watchTime của
   * YouTube. NGOẠI LỆ: nền tảng trong `SNAPSHOT_PROVIDERS` không cộng dồn,
   * chỉ giữ hàng mới nhất — xem định nghĩa bên dưới. */
  readonly extra: Readonly<Record<string, number>>
}

/** Nền tảng mà `extra` là TRẠNG THÁI TẠI THỜI ĐIỂM đồng bộ (snapshot), không
 * phải chỉ số phát sinh mỗi ngày — cộng dồn nhiều ngày lại là nhân sai số.
 * Merchant Center: số sản phẩm đã duyệt/bị từ chối là trạng thái NGAY LÚC
 * ĐÓ. TikTok (Display API — Login Kit) cũng vậy: KHÔNG có endpoint báo cáo
 * lịch sử theo ngày như YouTube Analytics hay Meta Page Insights,
 * `fetchDailyMetrics` chỉ đọc được TRẠNG THÁI HIỆN TẠI (follower/video/like
 * count cộng dồn từ trước tới giờ) mỗi lần đồng bộ — xem `tiktok-metrics.ts`.
 * Facebook KHÔNG nằm trong danh sách này — Page Insights (cùng Graph API với
 * Instagram) có `period=day` thật, xem `facebook-metrics.ts`. */
const SNAPSHOT_PROVIDERS: ReadonlySet<ProviderId> = new Set(['merchant-center', 'tiktok'])

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/** Cận trên THẬT của khoảng ngày cho nền tảng snapshot — không phải
 * `range.end`. Mọi preset (trừ "Hôm nay") cố tình chốt `end` ở HÔM QUA vì dữ
 * liệu hôm nay của GA4/GSC/Ads chưa xử lý xong. Merchant Center không có độ
 * trễ đó — hàng snapshot ghi đúng lúc đồng bộ, thường là HÔM NAY. Giữ nguyên
 * `range.end` sẽ khiến snapshot vừa đồng bộ xong không bao giờ lọt vào bất kỳ
 * preset nào — "Đang đồng bộ lần đầu…" hiện vĩnh viễn dù đã có dữ liệu thật. */
const snapshotUpperBound = (rangeEnd: string): string => {
  const todayIso = toIsoDate(new Date())
  return rangeEnd >= todayIso ? rangeEnd : todayIso
}

const EMPTY_TOTALS: ChannelTotals = {
  sessions: 0,
  users: 0,
  conversions: 0,
  clicks: 0,
  impressions: 0,
  costMicros: 0,
  conversionValueMicros: 0,
}

/** Tóm tắt số liệu thật của TỪNG nền tảng — dùng cho lưới thẻ ở trang Kênh. */
export const getChannelSummaries = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<ReadonlyMap<ProviderId, ChannelSummary>> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider')
    .eq('site_id', siteId)

  const connectionsByProvider = new Map<ProviderId, string[]>()
  for (const row of connections ?? []) {
    if (!isProviderId(row.provider)) continue
    const ids = connectionsByProvider.get(row.provider) ?? []
    ids.push(row.id)
    connectionsByProvider.set(row.provider, ids)
  }

  const snapshotConnectionIds: string[] = []
  const regularConnectionIds: string[] = []
  for (const row of connections ?? []) {
    if (!isProviderId(row.provider)) continue
    if (SNAPSHOT_PROVIDERS.has(row.provider)) snapshotConnectionIds.push(row.id)
    else regularConnectionIds.push(row.id)
  }

  const METRICS_COLUMNS =
    'connection_id, date, sessions, users, conversions, clicks, impressions, cost_micros, conversion_value_micros, extra'

  const [{ data: regularRows }, { data: snapshotRows }] = await Promise.all([
    regularConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('metrics_daily')
          .select(METRICS_COLUMNS)
          .in('connection_id', regularConnectionIds)
          .gte('date', range.start)
          .lte('date', range.end),
    snapshotConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('metrics_daily')
          .select(METRICS_COLUMNS)
          .in('connection_id', snapshotConnectionIds)
          .gte('date', range.start)
          .lte('date', snapshotUpperBound(range.end)),
  ])
  const metricsRows = [...(regularRows ?? []), ...(snapshotRows ?? [])]

  const connectionIdToProvider = new Map<string, ProviderId>()
  for (const [provider, ids] of connectionsByProvider) {
    for (const id of ids) connectionIdToProvider.set(id, provider)
  }

  const summaries = new Map<ProviderId, ChannelSummary>()
  const latestSnapshotDate = new Map<ProviderId, string>()

  for (const provider of PROVIDERS) {
    const connected = (connectionsByProvider.get(provider)?.length ?? 0) > 0
    summaries.set(provider, {
      provider,
      connected,
      hasData: false,
      totals: EMPTY_TOTALS,
      extra: {},
    })
  }

  for (const row of metricsRows ?? []) {
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

export interface ChannelDailyPoint {
  readonly date: string
  readonly sessions: number
  readonly users: number
  readonly conversions: number
  readonly clicks: number
  readonly impressions: number
  readonly costMicros: number
  readonly extra: Readonly<Record<string, number>>
}

/** Chuỗi ngày thật của MỘT nền tảng — dùng vẽ biểu đồ xu hướng ở trang chi
 * tiết kênh. Gộp nhiều connection cùng provider (vd. hai property GA4) vào
 * chung một điểm mỗi ngày thay vì vẽ N đường trùng ý nghĩa. */
export const getChannelDailySeries = async (
  siteId: string,
  provider: ProviderId,
  range: { readonly start: string; readonly end: string },
): Promise<readonly ChannelDailyPoint[]> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id')
    .eq('site_id', siteId)
    .eq('provider', provider)

  const connectionIds = (connections ?? []).map((row) => row.id)
  if (connectionIds.length === 0) return []

  const upperBound = SNAPSHOT_PROVIDERS.has(provider)
    ? snapshotUpperBound(range.end)
    : range.end

  const { data: rows } = await supabase
    .from('metrics_daily')
    .select('date, sessions, users, conversions, clicks, impressions, cost_micros, extra')
    .in('connection_id', connectionIds)
    .gte('date', range.start)
    .lte('date', upperBound)
    .order('date', { ascending: true })

  const byDate = new Map<string, ChannelDailyPoint>()

  for (const row of rows ?? []) {
    const extra = (row.extra ?? {}) as Record<string, number>
    const existing = byDate.get(row.date)

    if (!existing) {
      byDate.set(row.date, {
        date: row.date,
        sessions: row.sessions,
        users: row.users,
        conversions: row.conversions,
        clicks: row.clicks,
        impressions: row.impressions,
        costMicros: row.cost_micros,
        extra,
      })
      continue
    }

    const mergedExtra: Record<string, number> = { ...existing.extra }
    for (const [key, value] of Object.entries(extra)) {
      mergedExtra[key] = (mergedExtra[key] ?? 0) + (Number(value) || 0)
    }

    byDate.set(row.date, {
      date: row.date,
      sessions: existing.sessions + row.sessions,
      users: existing.users + row.users,
      conversions: existing.conversions + row.conversions,
      clicks: existing.clicks + row.clicks,
      impressions: existing.impressions + row.impressions,
      costMicros: existing.costMicros + row.cost_micros,
      extra: mergedExtra,
    })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
