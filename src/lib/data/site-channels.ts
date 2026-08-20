import 'server-only'

import { unstable_cache } from 'next/cache'
import { hasUsableData, type ConnectionStatus } from '@/lib/domain/connection'
import { PROVIDERS, isProviderId, type ProviderId } from '@/lib/domain/providers'
import { fetchMetaFollowerCount } from '@/lib/providers/meta-discovery'
import {
  fetchKlaviyoInventory,
  fetchKlaviyoNewProfileCount,
  fetchKlaviyoPerformance,
} from '@/lib/providers/klaviyo'
import { resolveKlaviyoApiKey, resolvePageAccessToken } from '@/lib/sync/access-token'
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
  /** Site có connection CÒN DÙNG ĐƯỢC cho nền tảng này (status `connected`
   * hoặc `syncing` — xem `hasUsableData`), bất kể có số liệu hay chưa. Một
   * hàng `connections` tồn tại nhưng `expired`/`error`/`revoked` vẫn tính là
   * `false` — token đã hỏng thì không còn là "đã kết nối" theo đúng nghĩa
   * người dùng hiểu, dù dữ liệu `metrics_daily` cũ vẫn còn trong DB. */
  readonly connected: boolean
  /** Có ít nhất một hàng metrics_daily thật — khác `connected`: GTM luôn
   * connected=true nhưng hasData=false mãi mãi, nó không có metrics. */
  readonly hasData: boolean
  readonly totals: ChannelTotals
  /** Gộp cộng dồn cột `extra` (jsonb) qua mọi ngày — vd. views/watchTime của
   * YouTube. NGOẠI LỆ: nền tảng trong `SNAPSHOT_PROVIDERS` không cộng dồn,
   * chỉ giữ hàng mới nhất — xem định nghĩa bên dưới. Klaviyo (không nằm
   * trong `metrics_daily`, xem field `currency` bên dưới) dùng field này
   * cho `campaignCount`/`flowCount`/`newProfileCount`/`revenueMicros` —
   * live-fetch, không cộng dồn qua ngày như các nền tảng khác. */
  readonly extra: Readonly<Record<string, number>>
  /** Đơn vị tiền THẬT của `extra.revenueMicros` — CHỈ Klaviyo set field này
   * (tài khoản Klaviyo có `preferred_currency` riêng, không nhất thiết
   * trùng `site.currency` — cùng bug đã sửa ở trang chi tiết kênh/Khám phá).
   * `null` cho mọi provider khác: `totals.costMicros`/`conversionValueMicros`
   * của họ ĐÚNG LÀ `site.currency`, không cần override. */
  readonly currency: string | null
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
 * liệu hôm nay của GA4/GSC/Ads chưa xử lý xong. Merchant Center/TikTok không
 * có độ trễ đó — hàng snapshot ghi đúng lúc đồng bộ, thường là HÔM NAY. Giữ
 * nguyên `range.end` sẽ khiến snapshot vừa đồng bộ xong không bao giờ lọt vào
 * bất kỳ preset nào — "Đang đồng bộ lần đầu…" hiện vĩnh viễn dù đã có dữ liệu
 * thật.
 *
 * CHỈ nới cận trên khi `rangeEnd` ĐÚNG BẰNG "hôm qua" — tức đây chính là cái
 * mốc bị preset tự động chốt xuống, không phải một ngày quá khứ THẬT SỰ được
 * chọn có chủ đích. Bản trước viết `rangeEnd >= todayIso ? rangeEnd :
 * todayIso` — biểu thức này ép MỌI ngày quá khứ (không chỉ "hôm qua") thành
 * "hôm nay", kể cả `range.previousEnd` của kỳ so sánh (vd. 8 ngày trước) hay
 * một khoảng tuỳ chỉnh thật sự kết thúc trong quá khứ xa. Hậu quả: truy vấn
 * kỳ so sánh luôn đọc SNAPSHOT MỚI NHẤT giống hệt kỳ hiện tại thay vì đúng
 * trạng thái tại thời điểm kỳ đó — bảng so sánh TikTok/Merchant Center ra
 * đúng MỘT bộ số cho cả hai cột (chênh lệch 0,0% giả) dù dữ liệu thật khác
 * nhau. Phát hiện qua đối chiếu số liệu người dùng báo cáo với hành vi hàm
 * này trên khoảng so sánh 06-08–12-08 khi khoảng hiện tại là 13-08–19-08. */
export const snapshotUpperBound = (rangeEnd: string): string => {
  const todayIso = toIsoDate(new Date())
  const yesterdayIso = toIsoDate(new Date(Date.now() - 86_400_000))
  return rangeEnd === yesterdayIso ? todayIso : rangeEnd
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
/** Số phút coi follower count còn "đủ mới" trước khi gọi lại Graph API thật
 * — follower count là một con số dạng "hiển thị tham khảo", không phải chỉ
 * số cần chính xác tới từng phút. Không cache thì `getChannelSummaries` gọi
 * Meta Graph API SỐNG trên MỌI lần tải trang Overview/Channels (đã xác nhận
 * qua điều tra hiệu năng 8/2026 là nguồn trễ tải trang lớn nhất) — cache 5
 * phút cắt gần hết số lượt gọi đó mà vẫn đủ mới cho một con số hiển thị.
 */
const FOLLOWER_COUNT_REVALIDATE_SECONDS = 300

interface MetaFollowerTarget {
  readonly connectionId: string
  readonly provider: 'facebook' | 'instagram'
  readonly externalAccountId: string
}

/** Tách riêng để `unstable_cache` bọc ĐÚNG phần I/O bên ngoài (gọi Graph API
 * thật) — không cache phần đọc `connections`/`metrics_daily` phía trên (đã đủ
 * rẻ, và cache y nguyên response tới tận connection info sẽ làm connection
 * mới thêm/xoá không phản ánh kịp). `targets` (không phải `siteId` suông)
 * quyết định luôn cache key qua tham số hàm — connection đổi (thêm/xoá/đổi
 * external_account_id) tự động ra cache key khác, không cần tự tay bump tag.
 */
const fetchMetaFollowerCounts = unstable_cache(
  async (
    siteId: string,
    targets: readonly MetaFollowerTarget[],
  ): Promise<readonly { readonly provider: 'facebook' | 'instagram'; readonly followerCount: number }[]> => {
    const admin = createAdminClient()
    const results = await Promise.all(
      targets.map(async ({ connectionId, provider, externalAccountId }) => {
        const tokenResult = await resolvePageAccessToken(admin, connectionId, siteId, provider)
        if (!tokenResult.ok) return null
        const followerCount = await fetchMetaFollowerCount(tokenResult.accessToken, externalAccountId)
        return followerCount === null ? null : { provider, followerCount }
      }),
    )
    return results.filter(
      (result): result is { provider: 'facebook' | 'instagram'; followerCount: number } => result !== null,
    )
  },
  ['meta-follower-counts'],
  { revalidate: FOLLOWER_COUNT_REVALIDATE_SECONDS },
)

export const getChannelSummaries = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<ReadonlyMap<ProviderId, ChannelSummary>> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id, status')
    .eq('site_id', siteId)

  const { connectionsByProvider, connectionIdToProvider, snapshotConnectionIds, regularConnectionIds } =
    splitConnectionsBySnapshot(connections ?? [])

  // `connectionsByProvider` (từ `splitConnectionsBySnapshot`) chỉ giữ id —
  // tính riêng nền tảng nào có connection CÒN DÙNG ĐƯỢC (status), vì một hàng
  // `connections` tồn tại không có nghĩa là kết nối còn sống (`expired`/
  // `error`/`revoked` — token đã hết hạn/thu hồi, cần kết nối lại — vẫn giữ
  // nguyên hàng và dữ liệu `metrics_daily` LỊCH SỬ, không bị xoá như
  // `disconnected` — xem `hasUsableData` trong `domain/connection.ts`).
  const usableProviders = new Set(
    (connections ?? [])
      .filter((connection) => hasUsableData(connection.status as ConnectionStatus))
      .map((connection) => connection.provider),
  )

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
    const connected = usableProviders.has(provider)
    summaries.set(provider, {
      provider,
      connected,
      hasData: false,
      totals: EMPTY_TOTALS,
      extra: {},
      currency: null,
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
  // thay vì đợi một lượt sync ghi lại — cache qua `fetchMetaFollowerCounts`
  // (5 phút, xem định nghĩa phía trên) thay vì gọi sống mỗi lần tải trang.
  // Lỗi ở đây KHÔNG được chặn cả trang Kênh — mỗi lượt tự nuốt lỗi (xem
  // `fetchMetaFollowerCount`), thiếu follower count chỉ khiến thẻ thiếu một
  // con số, không phải cả trang trắng.
  const metaFollowerConnectionIds = (['facebook', 'instagram'] as const).flatMap(
    (provider) => connectionsByProvider.get(provider) ?? [],
  )
  if (metaFollowerConnectionIds.length > 0) {
    const connectionsById = new Map((connections ?? []).map((row) => [row.id, row]))

    const targets: readonly MetaFollowerTarget[] = metaFollowerConnectionIds
      .map((connectionId): MetaFollowerTarget | null => {
        const provider = connectionIdToProvider.get(connectionId)
        const connectionRow = connectionsById.get(connectionId)
        if (provider !== 'facebook' && provider !== 'instagram') return null
        if (!connectionRow?.external_account_id) return null
        return { connectionId, provider, externalAccountId: connectionRow.external_account_id }
      })
      .filter((target): target is MetaFollowerTarget => target !== null)

    const followerResults = targets.length > 0 ? await fetchMetaFollowerCounts(siteId, targets) : []

    for (const result of followerResults) {
      const current = summaries.get(result.provider) as ChannelSummary
      summaries.set(result.provider, {
        ...current,
        extra: { ...current.extra, followerCount: (current.extra.followerCount ?? 0) + result.followerCount },
      })
    }
  }

  // Klaviyo: cùng lý do Facebook/Instagram ở trên — không có `MetricsAdapter`
  // ghi `metrics_daily` (Reporting API giới hạn 225 request/ngày, không đủ
  // đồng bộ hằng ngày mỗi connection, xem header `providers/klaviyo.ts`), nên
  // `hasData` ở trên PHẢI mãi là `false` cho Klaviyo — không phải lỗi. Trước
  // đây `ChannelCard`/`ChannelTrendCard` chỉ đọc `hasData` chung nên hiện
  // "Đang đồng bộ lần đầu…" VĨNH VIỄN dù trang chi tiết kênh vẫn lấy được số
  // liệu thật (live-fetch). Live-fetch NGAY TẠI ĐÂY bằng đúng 3 hàm trang chi
  // tiết kênh đã dùng — cả 3 đã TỰ CACHE 6 giờ theo apiKey/apiKey+range bên
  // trong `providers/klaviyo.ts`, nên không cần một lớp `unstable_cache` bọc
  // ngoài như `fetchMetaFollowerCounts` (Graph API follower KHÔNG tự cache).
  const klaviyoConnectionIds = connectionsByProvider.get('klaviyo') ?? []
  if (klaviyoConnectionIds.length > 0) {
    const admin = createAdminClient()
    const klaviyoRange = { startDate: range.start, endDate: range.end }

    await Promise.all(
      klaviyoConnectionIds.map(async (connectionId) => {
        const tokenResult = await resolveKlaviyoApiKey(admin, connectionId)
        if (!tokenResult.ok) return

        const [inventory, performance, newProfiles] = await Promise.all([
          fetchKlaviyoInventory(tokenResult.accessToken),
          fetchKlaviyoPerformance(tokenResult.accessToken, klaviyoRange),
          fetchKlaviyoNewProfileCount(tokenResult.accessToken, klaviyoRange),
        ])

        const revenueMicros =
          (performance.campaignPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0) +
          (performance.flowPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0)

        const current = summaries.get('klaviyo') as ChannelSummary
        summaries.set('klaviyo', {
          ...current,
          // KHÔNG dùng `hasData` (nghĩa cũ: "có hàng metrics_daily") —
          // đúng bản chất Klaviyo là "đã lấy được số liệu live", nên set
          // `true` ngay khi resolve token/fetch thành công, không đợi một
          // pipeline sync không tồn tại.
          hasData: true,
          extra: {
            ...current.extra,
            campaignCount: (current.extra.campaignCount ?? 0) + (performance.campaignPerformance?.length ?? 0),
            flowCount: (current.extra.flowCount ?? 0) + (performance.flowPerformance?.length ?? 0),
            newProfileCount: (current.extra.newProfileCount ?? 0) + (newProfiles.error ? 0 : newProfiles.count),
            revenueMicros: (current.extra.revenueMicros ?? 0) + revenueMicros,
          },
          currency: inventory.accountCurrency ?? current.currency ?? 'USD',
        })
      }),
    )
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
 * tiết kênh. Có `connectionId` (kênh đang chọn trên `ChannelSwitcher`) → chỉ
 * lấy đúng connection đó, khớp với phần còn lại của trang chi tiết kênh
 * (`getChannelDetail` cũng đã scope theo đúng connection này). Không truyền
 * → gộp MỌI connection cùng provider (vd. hai property GA4) vào chung một
 * điểm mỗi ngày — hành vi cũ, vẫn dùng khi trang chưa biết chọn kênh nào. */
export const getChannelDailySeries = async (
  siteId: string,
  provider: ProviderId,
  range: { readonly start: string; readonly end: string },
  connectionId?: string,
): Promise<readonly ChannelDailyPoint[]> => {
  const supabase = await createClient()

  let connectionIds: readonly string[]
  if (connectionId) {
    connectionIds = [connectionId]
  } else {
    const { data: connections } = await supabase
      .from('connections')
      .select('id')
      .eq('site_id', siteId)
      .eq('provider', provider)
    connectionIds = (connections ?? []).map((row) => row.id)
  }
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
