import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import type { ProviderId } from './providers'

/**
 * Chỉ số CHÍNH đáng vẽ theo ngày cho từng nền tảng — dùng ở trang Tổng quan
 * (biểu đồ nhỏ theo từng kênh) và các tab Google/Meta/TikTok. Cùng nguyên
 * tắc `channel-card.tsx` (đúng chỉ số riêng của nền tảng, không ép chung
 * một khuôn), chỉ khác là trả về CÁCH ĐỌC một điểm theo ngày thay vì một
 * tổng đã cộng dồn.
 *
 * `null` = nền tảng không có gì đáng vẽ theo thời gian (GTM là cấu hình,
 * Merchant Center là trạng thái duyệt sản phẩm — cả hai đã có UI riêng ở
 * trang chi tiết kênh, không lặp lại ở đây).
 */
export interface ChannelChartMetric {
  readonly label: string
  readonly format: 'number' | 'currency'
  readonly getValue: (point: ChannelDailyPoint) => number
}

export const channelChartMetric = (provider: ProviderId): ChannelChartMetric | null => {
  switch (provider) {
    case 'gtm':
    case 'merchant-center':
      return null
    case 'google-ads':
    case 'meta-ads':
      return { label: 'Chi phí', format: 'currency', getValue: (point) => point.costMicros }
    case 'ga4':
      return { label: 'Sessions', format: 'number', getValue: (point) => point.sessions }
    case 'gsc':
      return { label: 'Lượt nhấp tự nhiên', format: 'number', getValue: (point) => point.clicks }
    case 'youtube':
      return { label: 'Lượt xem', format: 'number', getValue: (point) => point.extra.views ?? 0 }
    case 'instagram':
      return { label: 'Reach', format: 'number', getValue: (point) => point.extra.reach ?? 0 }
    case 'facebook':
      return { label: 'Lượt hiển thị', format: 'number', getValue: (point) => point.extra.impressions ?? 0 }
    // Snapshot (xem SNAPSHOT_PROVIDERS ở site-channels.ts) — mỗi điểm là
    // trạng thái TẠI lần đồng bộ đó, không phải phát sinh trong ngày, nhưng
    // vẫn vẽ được đường xu hướng follower theo thời gian bình thường.
    case 'tiktok':
      return { label: 'Follower', format: 'number', getValue: (point) => point.extra.followerCount ?? 0 }
  }
}
