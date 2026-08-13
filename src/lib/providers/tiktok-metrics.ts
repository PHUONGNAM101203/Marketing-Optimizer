import 'server-only'

import type { DailyMetricRow, MetricsAdapter } from './metrics-types'

/**
 * TikTok Display API — nội dung hữu cơ. KHÔNG có endpoint báo cáo lịch sử
 * theo ngày (khác YouTube Analytics/Meta Page Insights) — `user/info` chỉ
 * trả TRẠNG THÁI HIỆN TẠI (follower/like/video count cộng dồn từ trước tới
 * giờ). Mỗi lần đồng bộ ghi đúng MỘT hàng cho hôm nay — `data/site-channels.ts`
 * biết KHÔNG được cộng dồn các hàng này qua nhiều ngày (xem `SNAPSHOT_PROVIDERS`),
 * chỉ giữ hàng mới nhất, giống Merchant Center.
 *
 * CHƯA ai chạy thử được với app thật — bám theo nghiên cứu tài liệu Display
 * API công khai (8/2026), cần verify khi có Client Key/Secret thật.
 */

const USER_INFO_ENDPOINT = 'https://open.tiktokapis.com/v2/user/info/'

const ZERO_ROW = {
  sessions: 0,
  users: 0,
  conversions: 0,
  clicks: 0,
  impressions: 0,
  costMicros: 0,
  conversionValueMicros: 0,
} as const

interface TiktokUserStats {
  readonly follower_count?: number
  readonly likes_count?: number
  readonly video_count?: number
}

export const tiktokMetricsAdapter: MetricsAdapter = {
  provider: 'tiktok',

  async fetchDailyMetrics({ accessToken, endDate }) {
    const url = new URL(USER_INFO_ENDPOINT)
    url.searchParams.set('fields', 'follower_count,likes_count,video_count')

    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return []

    const body = (await response.json()) as { data?: { user?: TiktokUserStats } }
    const user = body.data?.user
    if (!user) return []

    const row: DailyMetricRow = {
      ...ZERO_ROW,
      // Snapshot ghi vào HÔM NAY (endDate của cửa sổ đồng bộ) — không có ý
      // nghĩa "ngày phát sinh", chỉ là thời điểm đọc được trạng thái này.
      date: endDate,
      extra: {
        followerCount: user.follower_count ?? 0,
        likesCount: user.likes_count ?? 0,
        videoCount: user.video_count ?? 0,
      },
    }
    return [row]
  },
}
