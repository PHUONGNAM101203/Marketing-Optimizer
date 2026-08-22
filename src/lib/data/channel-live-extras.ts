import 'server-only'

import { unstable_cache } from 'next/cache'
import { fetchMetaFollowerCount } from '@/lib/providers/meta-discovery'
import {
  fetchKlaviyoInventory,
  fetchKlaviyoNewProfileCount,
  fetchKlaviyoPerformance,
} from '@/lib/providers/klaviyo'
import { resolveKlaviyoApiKey, resolvePageAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Hai nguồn số liệu của trang Kênh KHÔNG nằm trong `metrics_daily` mà phải gọi
 * API ngoài ngay lúc render. Tách khỏi `site-channels.ts` để `getChannelSummaries`
 * gọi được cả hai trong MỘT `Promise.all` — trước đây chúng nằm inline và chạy
 * nối tiếp, nên mỗi lần cache lạnh là cộng dồn độ trễ của Meta Graph API vào
 * độ trễ của Klaviyo Reporting API, dù không bên nào cần kết quả của bên kia.
 */

/** Số giây coi follower count còn "đủ mới" trước khi gọi lại Graph API thật
 * — follower count là con số dạng "hiển thị tham khảo", không phải chỉ số cần
 * chính xác tới từng phút. Không cache thì `getChannelSummaries` gọi Meta
 * Graph API SỐNG trên MỌI lần tải trang Overview/Channels (đã xác nhận qua
 * điều tra hiệu năng 8/2026 là nguồn trễ tải trang lớn nhất) — cache 5 phút
 * cắt gần hết số lượt gọi đó mà vẫn đủ mới cho một con số hiển thị. */
const FOLLOWER_COUNT_REVALIDATE_SECONDS = 300

export interface MetaFollowerTarget {
  readonly connectionId: string
  readonly provider: 'facebook' | 'instagram'
  readonly externalAccountId: string
}

export interface MetaFollowerCount {
  readonly provider: 'facebook' | 'instagram'
  readonly followerCount: number
}

/** `unstable_cache` bọc ĐÚNG phần I/O ra ngoài (gọi Graph API thật) — không
 * bọc phần đọc `connections`/`metrics_daily` của hàm gọi (đã đủ rẻ, và cache
 * y nguyên tới tận connection info sẽ làm connection mới thêm/xoá không phản
 * ánh kịp). `targets` (không phải `siteId` suông) quyết định luôn cache key
 * qua tham số hàm — connection đổi (thêm/xoá/đổi `external_account_id`) tự
 * động ra cache key khác, không cần tự tay bump tag. */
const fetchMetaFollowerCounts = unstable_cache(
  async (siteId: string, targets: readonly MetaFollowerTarget[]): Promise<readonly MetaFollowerCount[]> => {
    const admin = createAdminClient()
    const results = await Promise.all(
      targets.map(async ({ connectionId, provider, externalAccountId }) => {
        const tokenResult = await resolvePageAccessToken(admin, connectionId, siteId, provider)
        if (!tokenResult.ok) return null
        const followerCount = await fetchMetaFollowerCount(tokenResult.accessToken, externalAccountId)
        return followerCount === null ? null : { provider, followerCount }
      }),
    )
    return results.filter((result): result is MetaFollowerCount => result !== null)
  },
  ['meta-follower-counts'],
  { revalidate: FOLLOWER_COUNT_REVALIDATE_SECONDS },
)

/**
 * Follower count của Facebook/Instagram — trạng thái NGAY LÚC gọi, không phải
 * chỉ số phát sinh theo ngày, nên `metrics_daily` không có (xem
 * `facebook-metrics.ts`/`meta-metrics.ts`).
 *
 * Lỗi ở đây KHÔNG được chặn cả trang Kênh: `fetchMetaFollowerCount` tự nuốt
 * lỗi từng lượt, thiếu follower count chỉ khiến thẻ thiếu một con số chứ
 * không phải cả trang trắng.
 */
export const collectMetaFollowerCounts = async (
  siteId: string,
  targets: readonly MetaFollowerTarget[],
): Promise<readonly MetaFollowerCount[]> =>
  targets.length === 0 ? [] : fetchMetaFollowerCounts(siteId, targets)

export interface KlaviyoExtras {
  readonly campaignCount: number
  readonly flowCount: number
  readonly newProfileCount: number
  readonly revenueMicros: number
  /** Đơn vị tiền THẬT của tài khoản Klaviyo — không nhất thiết trùng
   * `site.currency`. `null` khi không lấy được connection nào. */
  readonly currency: string | null
  /** Có resolve token và fetch thành công ít nhất một connection không. */
  readonly hasData: boolean
}

const EMPTY_KLAVIYO_EXTRAS: KlaviyoExtras = {
  campaignCount: 0,
  flowCount: 0,
  newProfileCount: 0,
  revenueMicros: 0,
  currency: null,
  hasData: false,
}

/**
 * Klaviyo KHÔNG có `MetricsAdapter` ghi `metrics_daily` (Reporting API giới
 * hạn 225 request/ngày, không đủ đồng bộ hằng ngày mỗi connection — xem header
 * `providers/klaviyo.ts`), nên `hasData` suy từ `metrics_daily` sẽ mãi là
 * `false` cho Klaviyo. Đó KHÔNG phải lỗi, nhưng từng khiến
 * `ChannelCard`/`ChannelTrendCard` hiện "Đang đồng bộ lần đầu…" VĨNH VIỄN dù
 * trang chi tiết kênh vẫn lấy được số liệu thật. Vì vậy live-fetch ngay tại
 * đây bằng đúng 3 hàm trang chi tiết kênh dùng — cả 3 đã TỰ CACHE 6 giờ theo
 * apiKey/apiKey+range bên trong `providers/klaviyo.ts`, nên không cần thêm
 * một lớp `unstable_cache` bọc ngoài như phía Meta.
 */
export const collectKlaviyoExtras = async (
  connectionIds: readonly string[],
  range: { readonly start: string; readonly end: string },
): Promise<KlaviyoExtras> => {
  if (connectionIds.length === 0) return EMPTY_KLAVIYO_EXTRAS

  const admin = createAdminClient()
  const klaviyoRange = { startDate: range.start, endDate: range.end }

  const perConnection = await Promise.all(
    connectionIds.map(async (connectionId): Promise<KlaviyoExtras | null> => {
      const tokenResult = await resolveKlaviyoApiKey(admin, connectionId)
      if (!tokenResult.ok) return null

      const [inventory, performance, newProfiles] = await Promise.all([
        fetchKlaviyoInventory(tokenResult.accessToken),
        fetchKlaviyoPerformance(tokenResult.accessToken, klaviyoRange),
        fetchKlaviyoNewProfileCount(tokenResult.accessToken, klaviyoRange),
      ])

      const revenueMicros =
        (performance.campaignPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0) +
        (performance.flowPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0)

      return {
        campaignCount: performance.campaignPerformance?.length ?? 0,
        flowCount: performance.flowPerformance?.length ?? 0,
        newProfileCount: newProfiles.error ? 0 : newProfiles.count,
        revenueMicros,
        currency: inventory.accountCurrency ?? null,
        hasData: true,
      }
    }),
  )

  return perConnection
    .filter((entry): entry is KlaviyoExtras => entry !== null)
    .reduce(
      (acc, entry) => ({
        campaignCount: acc.campaignCount + entry.campaignCount,
        flowCount: acc.flowCount + entry.flowCount,
        newProfileCount: acc.newProfileCount + entry.newProfileCount,
        revenueMicros: acc.revenueMicros + entry.revenueMicros,
        // Giữ đơn vị tiền ĐẦU TIÊN tìm được: nhiều tài khoản Klaviyo khác đơn
        // vị tiền thì cộng gộp doanh thu vốn đã không có nghĩa, đổi qua đổi
        // lại đơn vị chỉ làm con số sai theo một kiểu khác.
        currency: acc.currency ?? entry.currency,
        hasData: true,
      }),
      EMPTY_KLAVIYO_EXTRAS,
    )
}
