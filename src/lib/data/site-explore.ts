import 'server-only'

import { isProviderId } from '@/lib/domain/providers'
import {
  fetchGa4Explore,
  fetchGscExplore,
  fetchYoutubeExplore,
  type Ga4Explore,
  type GscExplore,
  type YoutubeExplore,
} from '@/lib/providers/google-explore'
import {
  fetchFacebookContentExplore,
  fetchInstagramExplore,
  type FacebookExplore,
  type InstagramExplore,
} from '@/lib/providers/meta-explore'
import { fetchTiktokContentExplore, type TiktokExplore } from '@/lib/providers/tiktok'
import {
  fetchKlaviyoCampaigns,
  fetchKlaviyoFlows,
  fetchKlaviyoPerformance,
} from '@/lib/providers/klaviyo'
import { resolveAccessToken, resolveKlaviyoApiKey, resolvePageAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** GA4 Data API/Search Console cho `limit` tới hàng chục nghìn dòng một lượt
 * gọi — luôn fetch ở TRẦN này một lần duy nhất, rồi để trang Khám phá tự cắt
 * xuống 10-1000 và đổi hạng mục HOÀN TOÀN Ở CLIENT (`buildExploreRows` trong
 * `report-builder.tsx`), không gọi lại API mỗi lần người dùng bấm nút khác.
 * Trước đây mỗi lần đổi số hàng/hạng mục là một lượt điều hướng Link mới →
 * gọi lại GA4/GSC/YouTube từ đầu, chậm rõ rệt vì phải chờ Google trả lời.
 * Instagram/Facebook/TikTok KHÔNG nhận `limit` — API của họ tự giới hạn
 * (Graph API 25 bài/lượt, xem `meta-explore.ts`), không phải thiếu sót. */
const MAX_EXPLORE_FETCH_LIMIT = 1000

/** Một dòng campaign/flow Klaviyo, gộp tên (list nhẹ, không rate-limit) với
 * số liệu hiệu suất (report, ĐÃ CACHE 6 giờ — xem `fetchKlaviyoPerformance`
 * trong `providers/klaviyo.ts`). `kind` phân biệt campaign/flow vì Explore
 * gộp cả hai vào một danh sách duy nhất (khác channel-detail, hiện hai bảng
 * riêng) — `group`/dimension picker của `ReportBuilder` dùng field này. */
export interface KlaviyoExploreItem {
  readonly id: string
  readonly name: string
  readonly kind: 'campaign' | 'flow'
  readonly recipients: number
  readonly opens: number
  readonly clicks: number
  readonly conversions: number
  readonly revenueMicros: number
}

export interface KlaviyoExplore {
  readonly items: readonly KlaviyoExploreItem[]
  /** Lỗi thật từ report hiệu suất — campaign/flow vẫn liệt kê được (list
   * không phụ thuộc report), chỉ các cột số liệu sẽ trống. */
  readonly performanceError: string | null
}

export interface ExploreSource {
  readonly ga4: Ga4Explore | null
  readonly gsc: GscExplore | null
  readonly youtube: YoutubeExplore | null
  readonly instagram: InstagramExplore | null
  readonly facebook: FacebookExplore | null
  readonly tiktok: TiktokExplore | null
  readonly klaviyo: KlaviyoExplore | null
}

export const getExploreSource = async (
  siteId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<ExploreSource> => {
  const supabase = await createClient()
  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id')
    .eq('site_id', siteId)
    .in('provider', ['ga4', 'gsc', 'youtube', 'instagram', 'facebook', 'tiktok', 'klaviyo'])

  const admin = createAdminClient()
  const source: {
    ga4: Ga4Explore | null
    gsc: GscExplore | null
    youtube: YoutubeExplore | null
    instagram: InstagramExplore | null
    facebook: FacebookExplore | null
    tiktok: TiktokExplore | null
    klaviyo: KlaviyoExplore | null
  } = { ga4: null, gsc: null, youtube: null, instagram: null, facebook: null, tiktok: null, klaviyo: null }

  await Promise.all(
    (connections ?? []).map(async (connection): Promise<void> => {
      if (!isProviderId(connection.provider)) return

      // facebook/instagram cần Page access token riêng (`/media`/`/published_posts`
      // từ chối User token với 403) — cùng điều kiện `getChannelDetail` đã dùng
      // trong `site-channel-detail.ts`, KHÔNG được đổi lại `resolveAccessToken`
      // thường cho hai provider này. Klaviyo không phải OAuth — key riêng,
      // xem `resolveKlaviyoApiKey`.
      const tokenResult =
        connection.provider === 'facebook' || connection.provider === 'instagram'
          ? await resolvePageAccessToken(admin, connection.id, siteId, connection.provider)
          : connection.provider === 'klaviyo'
            ? await resolveKlaviyoApiKey(admin, connection.id)
            : await resolveAccessToken(admin, connection.id, siteId, connection.provider)
      if (!tokenResult.ok) return

      if (connection.provider === 'ga4') {
        source.ga4 = await fetchGa4Explore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      } else if (connection.provider === 'gsc') {
        source.gsc = await fetchGscExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      } else if (connection.provider === 'youtube') {
        source.youtube = await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      } else if (connection.provider === 'instagram') {
        source.instagram = await fetchInstagramExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
      } else if (connection.provider === 'facebook') {
        source.facebook = await fetchFacebookContentExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
      } else if (connection.provider === 'tiktok') {
        source.tiktok = await fetchTiktokContentExplore(tokenResult.accessToken, range)
      } else if (connection.provider === 'klaviyo') {
        const [campaigns, flows, performance] = await Promise.all([
          fetchKlaviyoCampaigns(tokenResult.accessToken),
          fetchKlaviyoFlows(tokenResult.accessToken),
          fetchKlaviyoPerformance(tokenResult.accessToken, range),
        ])
        const campaignPerformanceById = new Map(
          (performance.campaignPerformance ?? []).map((row) => [row.groupId, row]),
        )
        const flowPerformanceById = new Map((performance.flowPerformance ?? []).map((row) => [row.groupId, row]))

        source.klaviyo = {
          items: [
            ...campaigns.map((campaign) => {
              const stats = campaignPerformanceById.get(campaign.id)
              return {
                id: campaign.id,
                name: campaign.name,
                kind: 'campaign' as const,
                recipients: stats?.recipients ?? 0,
                opens: stats?.opens ?? 0,
                clicks: stats?.clicks ?? 0,
                conversions: stats?.conversions ?? 0,
                revenueMicros: stats?.conversionValueMicros ?? 0,
              }
            }),
            ...flows.map((flow) => {
              const stats = flowPerformanceById.get(flow.id)
              return {
                id: flow.id,
                name: flow.name,
                kind: 'flow' as const,
                recipients: stats?.recipients ?? 0,
                opens: stats?.opens ?? 0,
                clicks: stats?.clicks ?? 0,
                conversions: stats?.conversions ?? 0,
                revenueMicros: stats?.conversionValueMicros ?? 0,
              }
            }),
          ],
          performanceError: performance.error,
        }
      }
    }),
  )

  return source
}
