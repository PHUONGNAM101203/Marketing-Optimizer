import 'server-only'

import { PROVIDERS, isProviderId, type ProviderId } from '@/lib/domain/providers'
import { fetchMetaFollowerCount } from '@/lib/providers/meta-discovery'
import { resolvePageAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
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
 * Instagram) có `period=day` thật, xem `facebook-metrics.ts`.
 *
 * Export ra ngoài để `data/entities.ts`'s `getChannelSummariesForAgent` dùng
 * lại đúng tập này (trước đây tự định nghĩa một bản sao `AGENT_SNAPSHOT_PROVIDERS`
 * giống hệt, rủi ro lệch nhau khi có nền tảng snapshot mới chỉ được thêm ở
 * một trong hai file). */
export const SNAPSHOT_PROVIDERS: ReadonlySet<ProviderId> = new Set(['merchant-center', 'tiktok'])

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

/** Tách connections của một Site thành 3 chỉ mục dùng chung bởi mọi hàm bên
 * dưới cần truy vấn `metrics_daily` theo connection — một lượt truy vấn
 * `connections`, không lặp lại cho từng nền tảng. */
const splitConnectionsBySnapshot = (
  connections: readonly { readonly id: string; readonly provider: string }[],
) => {
  const connectionsByProvider = new Map<ProviderId, string[]>()
  const connectionIdToProvider = new Map<string, ProviderId>()
  const snapshotConnectionIds: string[] = []
  const regularConnectionIds: string[] = []

  for (const row of connections) {
    if (!isProviderId(row.provider)) continue
    const ids = connectionsByProvider.get(row.provider) ?? []
    ids.push(row.id)
    connectionsByProvider.set(row.provider, ids)
    connectionIdToProvider.set(row.id, row.provider)
    if (SNAPSHOT_PROVIDERS.has(row.provider)) snapshotConnectionIds.push(row.id)
    else regularConnectionIds.push(row.id)
  }

  return { connectionsByProvider, connectionIdToProvider, snapshotConnectionIds, regularConnectionIds }
}

/** Tóm tắt số liệu thật của TỪNG nền tảng — dùng cho lưới thẻ ở trang Kênh. */
export const getChannelSummaries = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<ReadonlyMap<ProviderId, ChannelSummary>> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id')
    .eq('site_id', siteId)

  const { connectionsByProvider, connectionIdToProvider, snapshotConnectionIds, regularConnectionIds } =
    splitConnectionsBySnapshot(connections ?? [])

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

  // Follower count: KHÔNG có trong `metrics_daily` — Facebook/Instagram chỉ
  // ghi lại chỉ số phát sinh theo ngày ở đó (`page_post_engagements`/
  // reach/impressions, xem `facebook-metrics.ts`/`meta-metrics.ts`), số
  // người theo dõi là trạng thái NGAY LÚC gọi. Gọi thẳng Graph API cùng cách
  // trang chi tiết kênh đã làm (`getChannelDetail`, xem `fetchMetaFollowerCount`)
  // thay vì đợi một lượt sync ghi lại — tối đa 2 lượt gọi (Facebook +
  // Instagram, mỗi site chỉ có tối đa một connection mỗi loại trong thực tế
  // dù code cộng dồn nếu có nhiều), không đáng kể so với chi phí trang chi
  // tiết kênh đã chấp nhận. Lỗi ở đây KHÔNG được chặn cả trang Kênh — mỗi
  // lượt tự nuốt lỗi (xem `fetchMetaFollowerCount`), thiếu follower count chỉ
  // khiến thẻ thiếu một con số, không phải cả trang trắng.
  const metaFollowerConnectionIds = (['facebook', 'instagram'] as const).flatMap(
    (provider) => connectionsByProvider.get(provider) ?? [],
  )
  if (metaFollowerConnectionIds.length > 0) {
    const admin = createAdminClient()
    const connectionsById = new Map((connections ?? []).map((row) => [row.id, row]))

    const followerResults = await Promise.all(
      metaFollowerConnectionIds.map(async (connectionId) => {
        const provider = connectionIdToProvider.get(connectionId)
        const connectionRow = connectionsById.get(connectionId)
        if (provider !== 'facebook' && provider !== 'instagram') return null
        if (!connectionRow?.external_account_id) return null

        const tokenResult = await resolvePageAccessToken(admin, connectionId, siteId, provider)
        if (!tokenResult.ok) return null

        const followerCount = await fetchMetaFollowerCount(tokenResult.accessToken, connectionRow.external_account_id)
        return followerCount === null ? null : { provider, followerCount }
      }),
    )

    for (const result of followerResults) {
      if (!result) continue
      const current = summaries.get(result.provider) as ChannelSummary
      summaries.set(result.provider, {
        ...current,
        extra: { ...current.extra, followerCount: (current.extra.followerCount ?? 0) + result.followerCount },
      })
    }
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

interface DailyMetricsRow {
  readonly date: string
  readonly sessions: number
  readonly users: number
  readonly conversions: number
  readonly clicks: number
  readonly impressions: number
  readonly cost_micros: number
  readonly extra: unknown
}

/** Gộp các hàng `metrics_daily` (nhiều connection cùng provider, vd. hai
 * property GA4) thành một điểm mỗi ngày — dùng chung bởi bản một-nền-tảng và
 * bản nhiều-nền-tảng cùng lúc bên dưới, tránh lặp lại đúng một logic gộp hai
 * lần. */
const mergeDailyRows = (rows: readonly DailyMetricsRow[]): readonly ChannelDailyPoint[] => {
  const byDate = new Map<string, ChannelDailyPoint>()

  for (const row of rows) {
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

const DAILY_METRICS_COLUMNS =
  'connection_id, date, sessions, users, conversions, clicks, impressions, cost_micros, extra'

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

  return mergeDailyRows(rows ?? [])
}

/**
 * Chuỗi ngày thật của MỌI nền tảng cùng lúc — dùng ở trang Tổng quan, nơi cả
 * 10 provider cần vẽ biểu đồ xu hướng riêng trên cùng một lượt render.
 *
 * Thay vì gọi `getChannelDailySeries` cho từng provider (10 lượt `connections`
 * + 10 lượt `metrics_daily` = 20 round-trip Supabase), hàm này gộp lại thành
 * TỐI ĐA 3 round-trip: một lượt `connections` cho cả Site, rồi tối đa hai lượt
 * `metrics_daily` (regular/snapshot) như `getChannelSummaries` — group theo
 * provider ở tầng JS sau khi đã có toàn bộ hàng.
 */
export const getChannelDailySeriesByProvider = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<ReadonlyMap<ProviderId, readonly ChannelDailyPoint[]>> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider')
    .eq('site_id', siteId)

  const { connectionIdToProvider, snapshotConnectionIds, regularConnectionIds } =
    splitConnectionsBySnapshot(connections ?? [])

  const [{ data: regularRows }, { data: snapshotRows }] = await Promise.all([
    regularConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('metrics_daily')
          .select(DAILY_METRICS_COLUMNS)
          .in('connection_id', regularConnectionIds)
          .gte('date', range.start)
          .lte('date', range.end),
    snapshotConnectionIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from('metrics_daily')
          .select(DAILY_METRICS_COLUMNS)
          .in('connection_id', snapshotConnectionIds)
          .gte('date', range.start)
          .lte('date', snapshotUpperBound(range.end)),
  ])

  const rowsByProvider = new Map<ProviderId, DailyMetricsRow[]>()
  for (const row of [...(regularRows ?? []), ...(snapshotRows ?? [])]) {
    const provider = connectionIdToProvider.get(row.connection_id)
    if (!provider) continue
    const bucket = rowsByProvider.get(provider) ?? []
    bucket.push(row)
    rowsByProvider.set(provider, bucket)
  }

  return new Map(PROVIDERS.map((provider) => [provider, mergeDailyRows(rowsByProvider.get(provider) ?? [])]))
}
