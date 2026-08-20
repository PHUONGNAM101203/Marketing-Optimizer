import { hasCapability, type ProviderId } from './providers'
import type { ChannelSummary } from '@/lib/data/site-channels'

export type ComparisonFormatter = 'compact' | 'number' | 'percent' | 'currency'

export interface ComparisonMetric {
  readonly key: string
  readonly label: string
  readonly formatter: ComparisonFormatter
  readonly getValue: (summary: ChannelSummary) => number | null
}

/**
 * Bộ chỉ số "đáng so sánh" cho MỖI nền tảng — dùng bởi `ChannelComparisonPanel`
 * để so hai khoảng ngày cạnh nhau. Cùng nguyên tắc `ChannelHeadline`
 * (`channel-card.tsx`): đúng chỉ số riêng của từng nền tảng, không ép chung
 * một khuôn "sessions/conversions" cho mọi loại. Đọc từ `ChannelSummary` (đã
 * gộp sẵn `totals`/`extra` qua `getChannelSummaries`) — hàm gọi nơi này chỉ
 * cần gọi `getChannelSummaries` HAI LẦN (khoảng hiện tại + khoảng so sánh),
 * không cần logic riêng cho từng provider ở tầng data.
 *
 * Mảng rỗng = nền tảng không có gì đáng so sánh theo thời gian (GTM — cấu
 * hình thẻ, không phải số liệu).
 */
export const channelComparisonMetrics = (provider: ProviderId): readonly ComparisonMetric[] => {
  if (provider === 'gtm') return []

  if (provider === 'merchant-center') {
    return [
      { key: 'approved', label: 'Sản phẩm đã duyệt', formatter: 'compact', getValue: (s) => s.extra.approvedProducts ?? 0 },
      { key: 'disapproved', label: 'Bị từ chối', formatter: 'compact', getValue: (s) => s.extra.disapprovedProducts ?? 0 },
      { key: 'pending', label: 'Đang chờ duyệt', formatter: 'compact', getValue: (s) => s.extra.pendingProducts ?? 0 },
    ]
  }

  if (provider === 'instagram') {
    return [
      { key: 'followerCount', label: 'Follower', formatter: 'compact', getValue: (s) => s.extra.followerCount ?? null },
      { key: 'reach', label: 'Reach', formatter: 'compact', getValue: (s) => s.extra.reach ?? 0 },
      { key: 'impressions', label: 'Hiển thị', formatter: 'compact', getValue: (s) => s.extra.impressions ?? 0 },
    ]
  }

  if (provider === 'facebook') {
    return [
      { key: 'followerCount', label: 'Follower', formatter: 'compact', getValue: (s) => s.extra.followerCount ?? null },
      { key: 'postEngagements', label: 'Tương tác bài viết', formatter: 'compact', getValue: (s) => s.extra.postEngagements ?? 0 },
    ]
  }

  if (provider === 'youtube') {
    return [
      { key: 'views', label: 'Lượt xem', formatter: 'compact', getValue: (s) => s.extra.views ?? 0 },
      { key: 'watchTimeMinutes', label: 'Phút xem', formatter: 'compact', getValue: (s) => s.extra.watchTimeMinutes ?? 0 },
      { key: 'subscribersGained', label: 'Subscriber mới', formatter: 'number', getValue: (s) => s.extra.subscribersGained ?? 0 },
    ]
  }

  // TikTok là SNAPSHOT (xem `SNAPSHOT_PROVIDERS` ở `site-channels.ts`) —
  // follower/like/video count là TRẠNG THÁI TẠI THỜI ĐIỂM đồng bộ, không
  // phải phát sinh trong kỳ. So sánh hai trạng thái NGAY TẠI cuối mỗi kỳ vẫn
  // có nghĩa ("kênh lớn nhanh cỡ nào từ kỳ trước tới kỳ này"), chỉ khác cách
  // đọc — không phải tổng cộng dồn.
  if (provider === 'tiktok') {
    return [
      { key: 'followerCount', label: 'Follower', formatter: 'compact', getValue: (s) => s.extra.followerCount ?? 0 },
      { key: 'likesCount', label: 'Lượt thích', formatter: 'compact', getValue: (s) => s.extra.likesCount ?? 0 },
      { key: 'videoCount', label: 'Số video', formatter: 'compact', getValue: (s) => s.extra.videoCount ?? 0 },
    ]
  }

  if (provider === 'klaviyo') {
    return [
      { key: 'revenueMicros', label: 'Doanh thu', formatter: 'currency', getValue: (s) => s.extra.revenueMicros ?? 0 },
      { key: 'campaignCount', label: 'Campaign', formatter: 'number', getValue: (s) => s.extra.campaignCount ?? 0 },
      { key: 'flowCount', label: 'Flow', formatter: 'number', getValue: (s) => s.extra.flowCount ?? 0 },
      { key: 'newProfileCount', label: 'Khách hàng mới', formatter: 'number', getValue: (s) => s.extra.newProfileCount ?? 0 },
    ]
  }

  if (hasCapability(provider, 'spend')) {
    return [
      { key: 'costMicros', label: 'Chi phí', formatter: 'currency', getValue: (s) => s.totals.costMicros },
      { key: 'conversions', label: 'Chuyển đổi', formatter: 'number', getValue: (s) => s.totals.conversions },
      {
        key: 'ctr',
        label: 'CTR',
        formatter: 'percent',
        getValue: (s) => (s.totals.impressions > 0 ? s.totals.clicks / s.totals.impressions : null),
      },
    ]
  }

  if (hasCapability(provider, 'rankings')) {
    return [
      { key: 'clicks', label: 'Lượt nhấp tự nhiên', formatter: 'compact', getValue: (s) => s.totals.clicks },
      { key: 'impressions', label: 'Hiển thị', formatter: 'compact', getValue: (s) => s.totals.impressions },
      {
        key: 'ctr',
        label: 'CTR',
        formatter: 'percent',
        getValue: (s) => (s.totals.impressions > 0 ? s.totals.clicks / s.totals.impressions : null),
      },
    ]
  }

  return [
    { key: 'sessions', label: 'Phiên', formatter: 'compact', getValue: (s) => s.totals.sessions },
    { key: 'users', label: 'Người dùng', formatter: 'compact', getValue: (s) => s.totals.users },
    { key: 'conversions', label: 'Chuyển đổi', formatter: 'number', getValue: (s) => s.totals.conversions },
  ]
}
