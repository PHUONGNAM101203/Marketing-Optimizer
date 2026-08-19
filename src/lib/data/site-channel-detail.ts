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
  countKlaviyoProfiles,
  fetchCampaignValuesReport,
  fetchFlowValuesReport,
  fetchKlaviyoCampaigns,
  fetchKlaviyoFlows,
  fetchKlaviyoLists,
  fetchKlaviyoSegments,
  resolveConversionMetricId,
  type KlaviyoCampaign,
  type KlaviyoFlow,
  type KlaviyoList,
  type KlaviyoSegment,
  type KlaviyoValuesRow,
} from '@/lib/providers/klaviyo'
import { unstable_cache } from 'next/cache'
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
      readonly data: TiktokExplore
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
      readonly flows: readonly KlaviyoFlow[]
      /** `null` khi không resolve được conversion metric (key thiếu quyền
       * `metrics:read`, hoặc tài khoản chưa có metric nào) — report khi đó
       * cũng `null`, không phải mảng rỗng giả vờ "không có gì". */
      readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
      readonly flowPerformance: readonly KlaviyoValuesRow[] | null
      readonly performanceError: string | null
      readonly profileCount: number | null
      readonly profileCountTruncated: boolean
      readonly segments: readonly KlaviyoSegment[]
      readonly lists: readonly KlaviyoList[]
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

/** Reporting API của Klaviyo giới hạn 225 request/NGÀY (so với hàng trăm/giây
 * của GA4/GSC) — gọi trực tiếp mỗi lần tải trang chi tiết kênh như các
 * provider khác sẽ cạn hạn mức chỉ sau vài chục lượt xem. Cache 6 giờ (tối
 * đa 4 lượt gọi thật/ngày mỗi report dù có bao nhiêu người xem trang) —
 * chấp nhận số liệu có thể trễ tới 6 giờ, đổi lấy việc KHÔNG BAO GIỜ cạn hạn
 * mức trong điều kiện dùng thực tế. `apiKey` nằm trong tham số hàm nên đổi
 * key (kết nối lại) tự ra cache key khác, không cần tự tay bump tag. */
const KLAVIYO_REPORT_REVALIDATE_SECONDS = 6 * 60 * 60

const fetchKlaviyoPerformance = unstable_cache(
  async (
    apiKey: string,
    range: { readonly startDate: string; readonly endDate: string },
  ): Promise<{
    readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
    readonly flowPerformance: readonly KlaviyoValuesRow[] | null
    readonly error: string | null
  }> => {
    const conversionMetricId = await resolveConversionMetricId(apiKey)
    if (!conversionMetricId) {
      return {
        campaignPerformance: null,
        flowPerformance: null,
        error: 'Không tìm được metric nào trong tài khoản Klaviyo này để tính chuyển đổi.',
      }
    }

    const reportRange = { start: range.startDate, end: range.endDate }
    const [campaigns, flows] = await Promise.all([
      fetchCampaignValuesReport(apiKey, conversionMetricId, reportRange),
      fetchFlowValuesReport(apiKey, conversionMetricId, reportRange),
    ])

    const error = campaigns.error ?? flows.error
    return {
      campaignPerformance: campaigns.error ? null : campaigns.rows,
      flowPerformance: flows.error ? null : flows.rows,
      error,
    }
  },
  ['klaviyo-performance'],
  { revalidate: KLAVIYO_REPORT_REVALIDATE_SECONDS },
)

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
      .select('id, external_account_id, account_name, avatar_url')
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
      const [campaigns, flows, profiles, segments, lists, performance] = await Promise.all([
        fetchKlaviyoCampaigns(tokenResult.accessToken),
        fetchKlaviyoFlows(tokenResult.accessToken),
        countKlaviyoProfiles(tokenResult.accessToken),
        fetchKlaviyoSegments(tokenResult.accessToken),
        fetchKlaviyoLists(tokenResult.accessToken),
        fetchKlaviyoPerformance(tokenResult.accessToken, range),
      ])
      return {
        kind: 'klaviyo',
        connectionId: resolvedConnectionId,
        accountName,
        externalAccountId,
        avatarUrl,
        campaigns,
        flows,
        campaignPerformance: performance.campaignPerformance,
        flowPerformance: performance.flowPerformance,
        performanceError: performance.error,
        profileCount: profiles.count,
        profileCountTruncated: profiles.truncated,
        segments,
        lists,
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
      // `Promise.all` chứ không await nối tiếp: ba lượt đọc độc lập nhau,
      // chạy song song thì TTFB của trang chi tiết kênh bằng lượt chậm hơn
      // thay vì bằng tổng ba lượt.
      const [data, trending, rangeStats] = await Promise.all([
        // Không truyền `externalAccountId` — Display API không có khái niệm
        // "chọn tài khoản", token đã gắn chết với đúng một tài khoản rồi.
        fetchTiktokContentExplore(tokenResult.accessToken, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/5 trong plan này).
        getTiktokVideoTrending(connection.id),
        // Đọc riêng từ snapshot đã lưu, không phải `data.topVideos` — xem
        // docblock `rangeStats` trên `ChannelDetail`.
        getTiktokVideoRangeStats(connection.id, range),
      ])
      return { kind: 'tiktok', connectionId: resolvedConnectionId, accountName, externalAccountId, avatarUrl, data, trending, rangeStats }
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
