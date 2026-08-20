import 'server-only'

import { isProviderId, type ProviderId } from '@/lib/domain/providers'
import {
  fetchGa4Explore,
  fetchGa4Overview,
  fetchGscExplore,
  fetchGscOverview,
  fetchGtmExplore,
  fetchYoutubeExplore,
  getYoutubeVideoTrending,
  type Ga4Explore,
  type Ga4Overview,
  type GscExplore,
  type GscOverview,
  type GtmExplore,
  type YoutubeExplore,
} from '@/lib/providers/google-explore'
import type { VideoSummary, VideoTrendingResult } from '@/lib/providers/video-trending-types'
import type { ContentTrendingResult } from '@/lib/providers/content-trending-types'
import { getTiktokVideoTrending, getTiktokVideoRangeStats } from '@/lib/data/video-trending'
import { getContentTrending } from '@/lib/data/content-trending'
import { snapshotUpperBound } from '@/lib/data/site-channels'
import { fetchGoogleAdsCampaignMetrics } from '@/lib/providers/google-ads'
import {
  fetchMerchantCenterProducts,
  fetchMerchantPerformanceReport,
  type MerchantProductPerformance,
  type MerchantProductStatus,
  type ProductApprovalStatus,
} from '@/lib/providers/google-merchant'
import { fetchMetaAdsCampaignMetrics } from '@/lib/providers/meta-metrics'
import {
  fetchInstagramExplore,
  fetchFacebookContentExplore,
  type InstagramExplore,
  type FacebookExplore,
} from '@/lib/providers/meta-explore'
import { fetchMetaFollowerCount } from '@/lib/providers/meta-discovery'
import { fetchTiktokContentExplore, type TiktokExplore } from '@/lib/providers/tiktok'
import { getGoogleAdsDeveloperToken } from './site-oauth-apps'
import { resolveAccessToken, resolveKlaviyoApiKey, resolvePageAccessToken } from '@/lib/sync/access-token'
import {
  fetchKlaviyoInventory,
  fetchKlaviyoNewProfileCount,
  fetchKlaviyoPerformance,
  type KlaviyoCampaign,
  type KlaviyoFlow,
  type KlaviyoForm,
  type KlaviyoList,
  type KlaviyoMetric,
  type KlaviyoSegment,
  type KlaviyoValuesRow,
} from '@/lib/providers/klaviyo'
import { addDays, toIsoDate } from '@/mock/dates'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface GoogleAdsExplore {
  readonly campaigns: readonly {
    readonly name: string
    readonly costMicros: number
    readonly clicks: number
    readonly conversions: number
  }[]
}

/** Cùng hình dạng với `GoogleAdsExplore` — Google Ads và Facebook Ads đều là
 * "chi phí theo chiến dịch", không cần một kiểu riêng cho từng cái. TikTok
 * KHÔNG còn ở đây — đã chuyển sang nội dung hữu cơ (`TiktokExplore`), xem
 * `providers/tiktok.ts`. */
export type CampaignExplore = GoogleAdsExplore

export interface MerchantCenterExplore {
  readonly products: readonly MerchantProductStatus[]
  /** true nếu danh mục có nhiều hơn số sản phẩm đọc được — xem
   * `google-merchant.ts`. UI phải nói rõ, không được im lặng cắt bớt. */
  readonly truncated: boolean
  readonly filter: ProductApprovalStatus | null
}

/**
 * Chi tiết một connection cụ thể của Site — dùng cho trang chi tiết kênh.
 * Trả `null` khi Site chưa kết nối nền tảng này, hoặc adapter chưa hỗ trợ
 * dò sâu (Ads/Meta/TikTok/Instagram — chỉ có connection thật khi nào có
 * adapter thật, hiện tại chưa).
 */
export type ChannelDetail =
  | {
      readonly kind: 'ga4'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: Ga4Explore
      readonly overview: Ga4Overview | null
      /** Lý do THẬT khi `overview` null — hiện trong tab "Chi tiết" thay vì
       * ẩn hẳn tab đi, xem `Ga4OverviewOutcome`. */
      readonly overviewError: string | null
    }
  | {
      readonly kind: 'gsc'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: GscExplore
      readonly overview: GscOverview | null
      /** Lý do THẬT khi `overview` null — cùng tinh thần `ga4`. */
      readonly overviewError: string | null
    }
  | {
      readonly kind: 'gtm'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: GtmExplore
    }
  | {
      readonly kind: 'youtube'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: YoutubeExplore
      readonly trending: VideoTrendingResult
    }
  | {
      readonly kind: 'google-ads'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: GoogleAdsExplore
    }
  | {
      readonly kind: 'merchant-center'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: MerchantCenterExplore
      readonly performance: readonly MerchantProductPerformance[]
      readonly performanceTruncated: boolean
      /** Lý do THẬT khi rỗng vì lỗi HTTP thật — KHÁC rỗng vì tài khoản chưa
       * đủ dữ liệu báo cáo (Google trả 200 với `results` rỗng, không phải
       * lỗi — xem `fetchMerchantPerformanceReport`). */
      readonly performanceError: string | null
    }
  | {
      readonly kind: 'meta-ads'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: CampaignExplore
    }
  | {
      readonly kind: 'instagram'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: InstagramExplore
      readonly trending: ContentTrendingResult
      /** Số người theo dõi CỐ ĐỊNH, không phụ thuộc khoảng ngày đang lọc —
       * xem `fetchMetaFollowerCount`. `null` = không lấy được (lỗi Graph API
       * hoặc field vắng mặt), KHÁC 0 người theo dõi thật. */
      readonly followerCount: number | null
    }
  | {
      readonly kind: 'tiktok'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      /** `true` khi connection đã kết nối đủ lâu (≥3 ngày — dư dả hơn nhiều
       * lần chu kỳ đồng bộ hằng giờ) mà `trending.earliestSnapshotAt` vẫn
       * `null` — dấu hiệu snapshot video đang LỖI THẬT (thiếu quyền
       * `video.list`, token hỏng...) chứ không phải "chưa đủ thời gian tích
       * luỹ". Tính SẴN ở đây (server, có `new Date()` xài thoải mái) thay vì
       * để `VideoTrendingWidget` tự tính `Date.now()` lúc render — component
       * đó là Client Component dùng hook, gọi hàm bất định (`Date.now()`)
       * ngay trong thân render vi phạm rule "render phải thuần" của
       * react-hooks (đã xác nhận qua lint), phải đẩy phép tính này ra khỏi
       * render. */
      readonly videoSnapshotsLikelyBroken: boolean
      /** KHÔNG còn `data: TiktokExplore` ở đây — 20 video gần nhất (Display
       * API sống) giờ tự fetch trong `TiktokExploreSection`
       * (`channel-detail-body.tsx`, bọc `<Suspense>` riêng) qua
       * `getTiktokExploreVideos` bên dưới, không còn nằm trên đường chặn
       * TTFB của toàn trang. Xem docblock case `'tiktok'` trong
       * `getChannelDetail`. */
      readonly trending: VideoTrendingResult
      /** Tăng trưởng views/likes/comments/shares TRONG khoảng ngày đang chọn,
       * tính từ snapshot đã lưu (`video_metrics_daily`) — KHÁC `data.topVideos`
       * (20 video gần nhất từ Display API, lọc theo ngày ĐĂNG chứ không phải
       * "có hoạt động trong khoảng"). Dùng cho Dashboard tab (bảng xếp hạng +
       * biểu đồ tổng quan tương tác); `data.topVideos` vẫn dùng riêng cho tab
       * Tổng quan (duyệt video thô, không cần chính xác theo khoảng ngày). */
      readonly rangeStats: readonly VideoSummary[]
    }
  | {
      readonly kind: 'facebook'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: FacebookExplore
      readonly trending: ContentTrendingResult
      /** Số người theo dõi CỐ ĐỊNH, không phụ thuộc khoảng ngày đang lọc —
       * xem `fetchMetaFollowerCount`. `null` = không lấy được (lỗi Graph API
       * hoặc field vắng mặt), KHÁC 0 người theo dõi thật. */
      readonly followerCount: number | null
    }
  | {
      readonly kind: 'klaviyo'
      readonly connectionId: string
      readonly accountName: string
      readonly externalAccountId: string
      readonly avatarUrl: string | null
      readonly campaigns: readonly KlaviyoCampaign[]
      readonly campaignsTruncated: boolean
      readonly flows: readonly KlaviyoFlow[]
      readonly flowsTruncated: boolean
      /** Số campaign/flow CÓ hoạt động (xuất hiện trong report) trong khoảng
       * ngày đang chọn — KHÁC `campaigns.length`/`flows.length` (tổng toàn
       * thời gian, dùng cho tab "Toàn thời gian"). `null` khi report lỗi. */
      readonly campaignCount: number | null
      readonly flowCount: number | null
      /** `null` khi không resolve được conversion metric (key thiếu quyền
       * `metrics:read`, hoặc tài khoản chưa có metric nào) — report khi đó
       * cũng `null`, không phải mảng rỗng giả vờ "không có gì". */
      readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
      readonly flowPerformance: readonly KlaviyoValuesRow[] | null
      readonly performanceError: string | null
      /** Cùng report campaign/flow ở trên nhưng khoảng ngày CỐ ĐỊNH 365 ngày
       * gần nhất — KHÔNG theo bộ lọc ngày ở đầu trang. Campaign là sự kiện
       * gửi MỘT LẦN (không như session GA4 lặp lại hằng ngày) — lọc theo một
       * khoảng ngày gần (vd. 7-28 ngày) khiến MỌI campaign gửi trước đó hiện
       * "—" vĩnh viễn dù đã gửi thật. Tab "Toàn thời gian" dùng cặp field
       * này để luôn thấy đủ lịch sử, tách khỏi tab "Tổng quan" (vẫn theo bộ
       * lọc ngày, nhất quán với các kênh khác). 365 ngày là TRẦN THẬT của
       * Klaviyo Reporting API (không nhận timeframe dài hơn 1 năm/lượt gọi). */
      readonly allTimeCampaignPerformance: readonly KlaviyoValuesRow[] | null
      readonly allTimeFlowPerformance: readonly KlaviyoValuesRow[] | null
      readonly allTimePerformanceError: string | null
      /** Đơn vị tiền THẬT của tài khoản Klaviyo (`preferred_currency` —
       * xem `fetchKlaviyoAccountCurrency`) — KHÁC `currency` truyền vào
       * `ChannelDetailBody` từ `site.currency` (đơn vị người dùng cấu hình
       * cho quảng cáo, GA4...). Dùng field này để format doanh thu Klaviyo,
       * không phải prop `currency` chung của trang — nhầm hai cái này từng
       * là bug thật khiến doanh thu USD hiện nhầm ký hiệu đồng Việt Nam. */
      readonly currency: string
      /** Khách hàng MỚI (tạo trong khoảng ngày đang chọn) — cho tab "Tổng
       * quan". `null` khi lượt gọi profiles thất bại ngay trang đầu — KHÁC 0
       * khách hàng thật, xem `KlaviyoProfileCount.error`. */
      readonly profileCount: number | null
      readonly profileCountTruncated: boolean
      /** TỔNG khách hàng toàn thời gian, không filter theo `created` — cho
       * tab "Toàn thời gian". Số CHÍNH XÁC trong hầu hết trường hợp
       * (`countKlaviyoProfiles` phân trang tới 200 trang mặc định), chỉ
       * `allTimeProfileCountTruncated` khi tài khoản có hơn ~20.000 hồ sơ. */
      readonly allTimeProfileCount: number | null
      readonly allTimeProfileCountTruncated: boolean
      readonly segments: readonly KlaviyoSegment[]
      readonly segmentsTruncated: boolean
      readonly lists: readonly KlaviyoList[]
      readonly listsTruncated: boolean
      readonly forms: readonly KlaviyoForm[]
      readonly formsTruncated: boolean
      /** Toàn bộ loại sự kiện (metric) tài khoản đang ghi nhận — vd. "Placed
       * Order", "Opened Email"… xem `fetchKlaviyoMetrics`. */
      readonly metrics: readonly KlaviyoMetric[]
      readonly metricsTruncated: boolean
    }
  | { readonly kind: 'unsupported' }

interface CampaignMetricRow {
  readonly campaignName: string
  readonly costMicros: number
  readonly clicks: number
  readonly conversions: number
}

/** Gộp báo cáo NGÀY×CHIẾN DỊCH thành tổng theo chiến dịch, sắp theo chi phí
 * giảm dần — dùng chung cho Google Ads/Facebook Ads/TikTok, ba nền tảng
 * "chi phí theo chiến dịch" duy nhất trong Khám phá. */
const groupCampaignRows = (
  rows: readonly CampaignMetricRow[],
): readonly { readonly name: string; readonly costMicros: number; readonly clicks: number; readonly conversions: number }[] => {
  const byCampaign = new Map<string, { costMicros: number; clicks: number; conversions: number }>()
  for (const row of rows) {
    const existing = byCampaign.get(row.campaignName) ?? { costMicros: 0, clicks: 0, conversions: 0 }
    byCampaign.set(row.campaignName, {
      costMicros: existing.costMicros + row.costMicros,
      clicks: existing.clicks + row.clicks,
      conversions: existing.conversions + row.conversions,
    })
  }

  return [...byCampaign.entries()]
    .map(([name, totals]) => ({ name, ...totals }))
    .sort((a, b) => b.costMicros - a.costMicros)
}

/** Danh sách nhẹ mọi connection của một provider trên Site — nguồn dữ liệu
 * cho `ChannelSwitcher` (dropdown đổi kênh). Sắp theo `connected_at` tăng dần
 * để kênh kết nối ĐẦU TIÊN luôn đứng đầu, khớp quy ước "mặc định = kênh đầu
 * tiên" của `getChannelDetail` khi không truyền `connectionId`. */
export interface ChannelConnectionOption {
  readonly id: string
  readonly accountName: string
  readonly avatarUrl: string | null
  readonly externalAccountId: string
}

export const listChannelConnections = async (
  siteId: string,
  provider: ProviderId,
): Promise<readonly ChannelConnectionOption[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('connections')
    .select('id, account_name, avatar_url, external_account_id')
    .eq('site_id', siteId)
    .eq('provider', provider)
    .order('connected_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    accountName: row.account_name,
    avatarUrl: row.avatar_url,
    externalAccountId: row.external_account_id,
  }))
}

/**
 * 20 video gần nhất của MỘT connection TikTok đã biết trước (Display API
 * sống) — tách khỏi `getChannelDetail` để gọi được từ một Server Component
 * con bọc `<Suspense>` riêng (`TiktokExploreSection`), không còn nằm trên
 * đường chặn TTFB của cả trang chi tiết kênh (xem docblock case `'tiktok'`
 * trong `getChannelDetail`). Nhận thẳng `connectionId` đã resolve sẵn — KHÔNG
 * tự truy vấn lại bảng `connections` để tìm đúng connection (trang cha đã
 * làm việc đó một lần trong `getChannelDetail`), tránh lặp lại logic chọn
 * connection mặc định/theo `?connection=`.
 */
export const getTiktokExploreVideos = async (
  siteId: string,
  connectionId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<TiktokExplore> => {
  const admin = createAdminClient()
  const tokenResult = await resolveAccessToken(admin, connectionId, siteId, 'tiktok')
  if (!tokenResult.ok) {
    return { topVideos: [], fetchError: 'Không lấy được token TikTok — thử ngắt kết nối và kết nối lại.' }
  }
  return fetchTiktokContentExplore(tokenResult.accessToken, range)
}

export const getChannelDetail = async (
  siteId: string,
  provider: ProviderId,
  range: { readonly startDate: string; readonly endDate: string },
  productFilter?: ProductApprovalStatus,
  connectionId?: string,
): Promise<ChannelDetail | null> => {
  const supabase = await createClient()
  // Có `connectionId` (từ `?connection=` trên URL) → dùng đúng connection đó,
  // nhưng vẫn buộc khớp `site_id`+`provider` — chặn việc sửa tay URL để đọc
  // connection của site/provider khác qua id đoán được. Không có/không khớp
  // (id lạ, đã bị xoá…) → rơi về connection kết nối ĐẦU TIÊN thay vì hàng bất
  // kỳ như code cũ (`.limit(1)` không `order`) — coi như không có param, ổn
  // định và dễ đoán hơn.
  const baseConnectionSelect = () =>
    supabase
      .from('connections')
      .select('id, external_account_id, account_name, avatar_url, connected_at')
      .eq('site_id', siteId)
      .eq('provider', provider)

  const defaultConnectionQuery = () =>
    baseConnectionSelect().order('connected_at', { ascending: true }).limit(1).maybeSingle()

  const { data: connection } = connectionId
    ? await (async () => {
        const byId = await baseConnectionSelect().eq('id', connectionId).maybeSingle()
        return byId.data ? byId : defaultConnectionQuery()
      })()
    : await defaultConnectionQuery()

  if (!connection) return null
  if (!isProviderId(provider)) return { kind: 'unsupported' }

  const admin = createAdminClient()
  // facebook/instagram: `/published_posts`/`/media` là edge cấp Page, từ
  // chối User token với HTTP 403 — cần Page access token riêng, xem
  // `resolvePageAccessToken` (`sync/access-token.ts`). Mọi provider khác giữ
  // nguyên `resolveAccessToken` (User token), không đổi hành vi.
  const tokenResult =
    provider === 'facebook' || provider === 'instagram'
      ? await resolvePageAccessToken(admin, connection.id, siteId, provider)
      : provider === 'klaviyo'
        ? await resolveKlaviyoApiKey(admin, connection.id)
        : await resolveAccessToken(admin, connection.id, siteId, provider)
  if (!tokenResult.ok) return { kind: 'unsupported' }

  const resolvedConnectionId = connection.id
  const accountName = connection.account_name
  const externalAccountId = connection.external_account_id
  const avatarUrl = connection.avatar_url
  const connectedAt = connection.connected_at

  switch (provider) {
    case 'ga4': {
      // Song song chứ không nối tiếp — hai lượt đọc độc lập nhau, giống hệt
      // lý do case 'youtube' bên dưới gộp `data`+`trending` trong một
      // `Promise.all`.
      const [data, overviewOutcome] = await Promise.all([
        fetchGa4Explore(tokenResult.accessToken, connection.external_account_id, range),
        fetchGa4Overview(tokenResult.accessToken, connection.external_account_id, range),
      ])
      return {
        kind: 'ga4',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data,
        overview: overviewOutcome.overview,
        overviewError: overviewOutcome.error,
      }
    }
    case 'gsc': {
      // `rowLimit` cao (khác GA4/GTM/YouTube — mặc định 10) vì tab "Chi tiết"
      // mới cần phân trang tới 1000 dòng/hạng mục; tab "Tổng quan" (không
      // đổi) tự cắt lại còn 10 dòng khi render, xem `channel-detail-body.tsx`.
      // Không cần chunk nhiều lượt gọi như GA4 — GSC không giới hạn số chỉ
      // số mỗi request.
      const GSC_CHANNEL_DETAIL_ROW_LIMIT = 1000
      const [data, overviewOutcome] = await Promise.all([
        fetchGscExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          GSC_CHANNEL_DETAIL_ROW_LIMIT,
        ),
        fetchGscOverview(tokenResult.accessToken, connection.external_account_id, range),
      ])
      return {
        kind: 'gsc',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data,
        overview: overviewOutcome.overview,
        overviewError: overviewOutcome.error,
      }
    }
    case 'gtm':
      return {
        kind: 'gtm',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data: await fetchGtmExplore(tokenResult.accessToken, connection.external_account_id),
      }
    case 'youtube': {
      // `Promise.all` chứ không await nối tiếp: hai lượt đọc độc lập nhau,
      // chạy song song thì TTFB của trang chi tiết kênh bằng lượt chậm hơn
      // thay vì bằng tổng hai lượt.
      const [data, trending] = await Promise.all([
        fetchYoutubeExplore(tokenResult.accessToken, connection.external_account_id, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/6 trong plan này).
        getYoutubeVideoTrending(tokenResult.accessToken, connection.external_account_id),
      ])
      return { kind: 'youtube', connectionId: resolvedConnectionId, accountName, externalAccountId, avatarUrl, data, trending }
    }
    case 'merchant-center': {
      const [{ products, truncated }, performanceOutcome] = await Promise.all([
        fetchMerchantCenterProducts(tokenResult.accessToken, connection.external_account_id, productFilter),
        fetchMerchantPerformanceReport(tokenResult.accessToken, connection.external_account_id, range),
      ])
      return {
        kind: 'merchant-center',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data: { products, truncated, filter: productFilter ?? null },
        performance: performanceOutcome.rows,
        performanceTruncated: performanceOutcome.truncated,
        performanceError: performanceOutcome.error,
      }
    }
    case 'klaviyo': {
      // Cả 4 lượt gọi dưới đây ĐÃ CACHE (6 giờ) ở tầng provider — trang chi
      // tiết kênh trước đây gọi TRỰC TIẾP 11 request rải rác (campaigns/
      // flows/segments/lists/forms/metrics/currency/2×profile-count/2×report),
      // một lượt tải cold có thể mất 10-40+ round-trip tuần tự tới Klaviyo
      // (nguyên nhân "load rất lâu và lag", 8/2026). `fetchKlaviyoInventory`
      // KHÔNG phụ thuộc khoảng ngày (cache theo apiKey) nên đổi khoảng ngày
      // ở đầu trang không làm nó cache-miss; chỉ `fetchKlaviyoNewProfileCount`/
      // `fetchKlaviyoPerformance` mới phụ thuộc `range`.
      const inventory = await fetchKlaviyoInventory(tokenResult.accessToken)
      const rangeProfiles = await fetchKlaviyoNewProfileCount(tokenResult.accessToken, range)

      // TUẦN TỰ, không Promise.all — cả hai lượt đều đụng Reporting API (giới
      // hạn ~1 request/giây, xem `fetchKlaviyoPerformance`); gọi song song sẽ
      // tái diễn đúng lỗi 429 vừa sửa ở tầng dưới.
      const performance = await fetchKlaviyoPerformance(tokenResult.accessToken, range)
      const allTimeRange = {
        startDate: toIsoDate(addDays(new Date(), -365)),
        endDate: toIsoDate(new Date()),
      }
      const allTimePerformance = await fetchKlaviyoPerformance(tokenResult.accessToken, allTimeRange)

      return {
        kind: 'klaviyo',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        campaigns: inventory.campaigns.items,
        campaignsTruncated: inventory.campaigns.truncated,
        flows: inventory.flows.items,
        flowsTruncated: inventory.flows.truncated,
        // Campaign/flow "đang có hoạt động" trong khoảng ngày đang chọn =
        // số dòng report cho khoảng đó (report chỉ trả về campaign/flow có
        // ít nhất một chỉ số trong khoảng ngày) — `null` khi report lỗi,
        // không phải 0 giả.
        campaignCount: performance.campaignPerformance?.length ?? null,
        flowCount: performance.flowPerformance?.length ?? null,
        campaignPerformance: performance.campaignPerformance,
        flowPerformance: performance.flowPerformance,
        performanceError: performance.error,
        allTimeCampaignPerformance: allTimePerformance.campaignPerformance,
        allTimeFlowPerformance: allTimePerformance.flowPerformance,
        allTimePerformanceError: allTimePerformance.error,
        currency: inventory.accountCurrency ?? 'USD',
        profileCount: rangeProfiles.error ? null : rangeProfiles.count,
        profileCountTruncated: rangeProfiles.truncated,
        allTimeProfileCount: inventory.allTimeProfiles.error ? null : inventory.allTimeProfiles.count,
        allTimeProfileCountTruncated: inventory.allTimeProfiles.truncated,
        segments: inventory.segments.items,
        segmentsTruncated: inventory.segments.truncated,
        lists: inventory.lists.items,
        listsTruncated: inventory.lists.truncated,
        forms: inventory.forms.items,
        formsTruncated: inventory.forms.truncated,
        metrics: inventory.metrics.items,
        metricsTruncated: inventory.metrics.truncated,
      }
    }
    case 'google-ads': {
      const developerToken = await getGoogleAdsDeveloperToken(siteId)
      if (!developerToken) return { kind: 'unsupported' }

      const rows = await fetchGoogleAdsCampaignMetrics(
        tokenResult.accessToken,
        developerToken,
        connection.external_account_id,
        range,
      )

      return {
        kind: 'google-ads',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data: { campaigns: groupCampaignRows(rows) },
      }
    }
    case 'meta-ads': {
      const rows = await fetchMetaAdsCampaignMetrics(
        tokenResult.accessToken,
        connection.external_account_id,
        range,
      )
      return {
        kind: 'meta-ads',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        data: { campaigns: groupCampaignRows(rows) },
      }
    }
    case 'tiktok': {
      // CHỈ hai lượt đọc ở đây — KHÔNG còn `fetchTiktokContentExplore`
      // (lượt gọi SỐNG tới TikTok Display API, độ trễ mạng thật, ~vài trăm
      // ms tới vài giây) trong `Promise.all` chặn TTFB của cả trang. Trước
      // đây mọi lần đổi khoảng ngày phải đợi lượt gọi này xong dù tab đang
      // xem là "Dashboard" (chỉ cần `rangeStats`/`trending`, hai RPC Supabase
      // nhanh hơn nhiều) — cảm giác "bấm đổi khoảng ngày load lâu" người
      // dùng báo cáo. Danh sách 20 video gần nhất (tab "Tổng quan") giờ tự
      // fetch trong `TiktokExploreSection` (Client boundary `<Suspense>`
      // riêng, xem `channel-detail-body.tsx`), qua `getTiktokExploreVideos`
      // bên dưới — không chặn phần còn lại của trang.
      const [trending, rangeStats] = await Promise.all([
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/5 trong plan này).
        getTiktokVideoTrending(connection.id),
        // Đọc riêng từ snapshot đã lưu, không phải `data.topVideos` — xem
        // docblock `rangeStats` trên `ChannelDetail`. `snapshotUpperBound`
        // (không phải `range.endDate` suông): mọi preset (trừ "Hôm nay") cố
        // tình chốt `endDate` ở HÔM QUA (dữ liệu GA4/GSC/Ads hôm nay chưa xử
        // lý xong), nhưng snapshot TikTok ghi đúng lúc đồng bộ — THƯỜNG LÀ
        // HÔM NAY. Giữ nguyên `range.endDate` khiến snapshot vừa đồng bộ
        // xong không bao giờ lọt vào `get_video_range_snapshots` (điều kiện
        // `date <= p_range_end`), "Video xem nhiều nhất" trống mãi dù đã có
        // dữ liệu thật — xác nhận qua truy vấn DB thật (106 dòng, toàn bộ
        // ngày hôm nay, trong khi mọi preset chốt endDate ở hôm qua). Cùng
        // hàm `getChannelSummaries`/`getChannelDailySeries*` đã dùng cho
        // metrics_daily, giờ áp thêm cho video_metrics_daily.
        getTiktokVideoRangeStats(connection.id, { ...range, endDate: snapshotUpperBound(range.endDate) }),
      ])
      const daysSinceConnected = Math.floor((Date.now() - new Date(connectedAt).getTime()) / 86_400_000)
      return {
        kind: 'tiktok',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        videoSnapshotsLikelyBroken: trending.earliestSnapshotAt === null && daysSinceConnected >= 3,
        trending,
        rangeStats,
      }
    }
    case 'instagram': {
      // `Promise.all` chứ không await nối tiếp: hai lượt đọc độc lập nhau,
      // chạy song song thì TTFB của trang chi tiết kênh bằng lượt chậm hơn
      // thay vì bằng tổng hai lượt (bài học từ lượt đầu của `tiktok`/`youtube`
      // — build song song ngay từ đầu, không sửa lại sau).
      const [data, trending, followerCount] = await Promise.all([
        fetchInstagramExplore(tokenResult.accessToken, connection.external_account_id, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn, cùng quy ước `tiktok`/`youtube`.
        getContentTrending(connection.id, 'instagram'),
        fetchMetaFollowerCount(tokenResult.accessToken, connection.external_account_id),
      ])
      return { kind: 'instagram', connectionId: resolvedConnectionId, accountName, externalAccountId, avatarUrl, data, trending, followerCount }
    }
    case 'facebook': {
      const [data, trending, followerCount] = await Promise.all([
        fetchFacebookContentExplore(tokenResult.accessToken, connection.external_account_id, range),
        getContentTrending(connection.id, 'facebook'),
        fetchMetaFollowerCount(tokenResult.accessToken, connection.external_account_id),
      ])
      return { kind: 'facebook', connectionId: resolvedConnectionId, accountName, externalAccountId, avatarUrl, data, trending, followerCount }
    }
    default:
      return { kind: 'unsupported' }
  }
}
