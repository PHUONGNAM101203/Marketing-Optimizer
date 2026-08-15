import 'server-only'

import { isProviderId, type ProviderId } from '@/lib/domain/providers'
import {
  fetchGa4Explore,
  fetchGscExplore,
  fetchGtmExplore,
  fetchYoutubeExplore,
  getYoutubeVideoTrending,
  type Ga4Explore,
  type GscExplore,
  type GtmExplore,
  type YoutubeExplore,
} from '@/lib/providers/google-explore'
import type { VideoTrendingResult } from '@/lib/providers/video-trending-types'
import type { ContentTrendingResult } from '@/lib/providers/content-trending-types'
import { getTiktokVideoTrending } from '@/lib/data/video-trending'
import { getContentTrending } from '@/lib/data/content-trending'
import { fetchGoogleAdsCampaignMetrics } from '@/lib/providers/google-ads'
import {
  fetchMerchantCenterProducts,
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
import { fetchTiktokContentExplore, type TiktokExplore } from '@/lib/providers/tiktok'
import { getGoogleAdsDeveloperToken } from './site-oauth-apps'
import { resolveAccessToken, resolvePageAccessToken } from '@/lib/sync/access-token'
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
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: Ga4Explore
    }
  | {
      readonly kind: 'gsc'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: GscExplore
    }
  | {
      readonly kind: 'gtm'
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
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: MerchantCenterExplore
    }
  | {
      readonly kind: 'meta-ads'
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
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: InstagramExplore
      readonly trending: ContentTrendingResult
    }
  | {
      readonly kind: 'tiktok'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: TiktokExplore
      readonly trending: VideoTrendingResult
    }
  | {
      readonly kind: 'facebook'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: FacebookExplore
      readonly trending: ContentTrendingResult
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

export const getChannelDetail = async (
  siteId: string,
  provider: ProviderId,
  range: { readonly startDate: string; readonly endDate: string },
  productFilter?: ProductApprovalStatus,
): Promise<ChannelDetail | null> => {
  const supabase = await createClient()
  const { data: connection } = await supabase
    .from('connections')
    .select('id, external_account_id, account_name, avatar_url')
    .eq('site_id', siteId)
    .eq('provider', provider)
    .limit(1)
    .maybeSingle()

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
      : await resolveAccessToken(admin, connection.id, siteId, provider)
  if (!tokenResult.ok) return { kind: 'unsupported' }

  const accountName = connection.account_name
  const externalAccountId = connection.external_account_id
  const avatarUrl = connection.avatar_url

  switch (provider) {
    case 'ga4':
      return {
        kind: 'ga4',
        accountName,
        externalAccountId,
        avatarUrl,
        data: await fetchGa4Explore(tokenResult.accessToken, connection.external_account_id, range),
      }
    case 'gsc':
      return {
        kind: 'gsc',
        accountName,
        externalAccountId,
        avatarUrl,
        data: await fetchGscExplore(tokenResult.accessToken, connection.external_account_id, range),
      }
    case 'gtm':
      return {
        kind: 'gtm',
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
      return { kind: 'youtube', accountName, externalAccountId, avatarUrl, data, trending }
    }
    case 'merchant-center': {
      const { products, truncated } = await fetchMerchantCenterProducts(
        tokenResult.accessToken,
        connection.external_account_id,
        productFilter,
      )
      return {
        kind: 'merchant-center',
        accountName,
        externalAccountId,
        avatarUrl,
        data: { products, truncated, filter: productFilter ?? null },
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
        accountName,
        externalAccountId,
        avatarUrl,
        data: { campaigns: groupCampaignRows(rows) },
      }
    }
    case 'tiktok': {
      // `Promise.all` chứ không await nối tiếp: hai lượt đọc độc lập nhau,
      // chạy song song thì TTFB của trang chi tiết kênh bằng lượt chậm hơn
      // thay vì bằng tổng hai lượt.
      const [data, trending] = await Promise.all([
        // Không truyền `externalAccountId` — Display API không có khái niệm
        // "chọn tài khoản", token đã gắn chết với đúng một tài khoản rồi.
        fetchTiktokContentExplore(tokenResult.accessToken, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/5 trong plan này).
        getTiktokVideoTrending(connection.id),
      ])
      return { kind: 'tiktok', accountName, externalAccountId, avatarUrl, data, trending }
    }
    case 'instagram': {
      // `Promise.all` chứ không await nối tiếp: hai lượt đọc độc lập nhau,
      // chạy song song thì TTFB của trang chi tiết kênh bằng lượt chậm hơn
      // thay vì bằng tổng hai lượt (bài học từ lượt đầu của `tiktok`/`youtube`
      // — build song song ngay từ đầu, không sửa lại sau).
      const [data, trending] = await Promise.all([
        fetchInstagramExplore(tokenResult.accessToken, connection.external_account_id, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn, cùng quy ước `tiktok`/`youtube`.
        getContentTrending(connection.id, 'instagram'),
      ])
      return { kind: 'instagram', accountName, externalAccountId, avatarUrl, data, trending }
    }
    case 'facebook': {
      const [data, trending] = await Promise.all([
        fetchFacebookContentExplore(tokenResult.accessToken, connection.external_account_id, range),
        getContentTrending(connection.id, 'facebook'),
      ])
      return { kind: 'facebook', accountName, externalAccountId, avatarUrl, data, trending }
    }
    default:
      return { kind: 'unsupported' }
  }
}
