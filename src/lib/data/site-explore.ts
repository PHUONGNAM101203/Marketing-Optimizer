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
import { fetchKlaviyoInventory, fetchKlaviyoPerformance } from '@/lib/providers/klaviyo'
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
  /** Đơn vị tiền THẬT của tài khoản Klaviyo (`preferred_currency`) — KHÁC
   * `site.currency` truyền cho `ReportBuilder`, cùng lý do đã sửa ở trang
   * chi tiết kênh (`site-channel-detail.ts`). `ReportBuilder` dùng field
   * này CHỈ cho cột `revenueMicros`, không áp cho `costMicros`/`cpaMicros`
   * của Google/Meta/TikTok (những cột đó đúng là `site.currency`). */
  readonly currency: string
}

/** Một nguồn dữ liệu gắn với ĐÚNG MỘT connection — `accountName` (cột
 * `account_name`, ghi một lần lúc kết nối, xem `connections.sql`) là nhãn
 * phân biệt khi site có từ 2 connection cùng provider trở lên (vd. 2 tài
 * khoản TikTok). `ReportBuilder` dùng field này để hiện "TikTok · Kênh A" /
 * "TikTok · Kênh B" thay vì gộp lẫn hai tài khoản vào một dòng "TikTok". */
export interface ExploreConnectionEntry<T> {
  readonly connectionId: string
  readonly accountName: string
  readonly data: T
}

export interface ExploreSource {
  readonly ga4: readonly ExploreConnectionEntry<Ga4Explore>[]
  readonly gsc: readonly ExploreConnectionEntry<GscExplore>[]
  readonly youtube: readonly ExploreConnectionEntry<YoutubeExplore>[]
  readonly instagram: readonly ExploreConnectionEntry<InstagramExplore>[]
  readonly facebook: readonly ExploreConnectionEntry<FacebookExplore>[]
  readonly tiktok: readonly ExploreConnectionEntry<TiktokExplore>[]
  readonly klaviyo: readonly ExploreConnectionEntry<KlaviyoExplore>[]
}

export const getExploreSource = async (
  siteId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<ExploreSource> => {
  const supabase = await createClient()
  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id, account_name')
    .eq('site_id', siteId)
    .in('provider', ['ga4', 'gsc', 'youtube', 'instagram', 'facebook', 'tiktok', 'klaviyo'])

  const admin = createAdminClient()
  // MẢNG, không phải field đơn — trước đây field đơn (`ga4: Ga4Explore | null`)
  // khiến site có 2 connection CÙNG provider (vd. 2 tài khoản TikTok, ràng
  // buộc unique key `(site_id, provider, external_account_id)` trong
  // `connections.sql` CHO PHÉP việc này) bị connection chạy xong SAU ghi đè
  // mất connection chạy xong TRƯỚC — mất dữ liệu ngẫu nhiên theo thứ tự
  // Promise.all trả về, không phải lỗi hiển thị. `push` vào mảng thay vì gán
  // đè giữ lại TẤT CẢ connection.
  const source: {
    ga4: ExploreConnectionEntry<Ga4Explore>[]
    gsc: ExploreConnectionEntry<GscExplore>[]
    youtube: ExploreConnectionEntry<YoutubeExplore>[]
    instagram: ExploreConnectionEntry<InstagramExplore>[]
    facebook: ExploreConnectionEntry<FacebookExplore>[]
    tiktok: ExploreConnectionEntry<TiktokExplore>[]
    klaviyo: ExploreConnectionEntry<KlaviyoExplore>[]
  } = { ga4: [], gsc: [], youtube: [], instagram: [], facebook: [], tiktok: [], klaviyo: [] }

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
        const data = await fetchGa4Explore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
        source.ga4.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'gsc') {
        const data = await fetchGscExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
        source.gsc.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'youtube') {
        const data = await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
        source.youtube.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'instagram') {
        const data = await fetchInstagramExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
        source.instagram.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'facebook') {
        const data = await fetchFacebookContentExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
        source.facebook.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'tiktok') {
        const data = await fetchTiktokContentExplore(tokenResult.accessToken, range)
        source.tiktok.push({ connectionId: connection.id, accountName: connection.account_name, data })
      } else if (connection.provider === 'klaviyo') {
        // `fetchKlaviyoInventory` ĐÃ CACHE (6 giờ, không phụ thuộc `range`) —
        // trước đây trang Khám phá gọi `fetchKlaviyoCampaigns`/`fetchKlaviyoFlows`
        // TRỰC TIẾP mỗi lần tải trang, cùng nguyên nhân chậm đã sửa ở trang
        // chi tiết kênh (`site-channel-detail.ts`). Cũng lấy `accountCurrency`
        // ở đây luôn thay vì mặc định `site.currency` — bug thật khiến doanh
        // thu Klaviyo hiện nhầm ký hiệu VND ở trang này.
        const [inventory, performance] = await Promise.all([
          fetchKlaviyoInventory(tokenResult.accessToken),
          fetchKlaviyoPerformance(tokenResult.accessToken, range),
        ])
        const campaignPerformanceById = new Map(
          (performance.campaignPerformance ?? []).map((row) => [row.groupId, row]),
        )
        const flowPerformanceById = new Map((performance.flowPerformance ?? []).map((row) => [row.groupId, row]))

        const klaviyoData: KlaviyoExplore = {
          items: [
            ...inventory.campaigns.items.map((campaign) => {
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
            ...inventory.flows.items.map((flow) => {
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
          currency: inventory.accountCurrency ?? 'USD',
        }
        source.klaviyo.push({
          connectionId: connection.id,
          accountName: connection.account_name,
          data: klaviyoData,
        })
      }
    }),
  )

  return source
}
