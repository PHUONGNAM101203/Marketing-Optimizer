import { Heart, MessageCircle, Share2 } from 'lucide-react'
import type { MetaPostMetric } from './meta-post-list'

/**
 * Xây `metrics` cho `MetaPostItem` — dùng chung mọi nơi cần hiển thị bài
 * đăng Facebook/Instagram (tab Tổng quan lẫn hai widget xếp hạng ở
 * Dashboard), tránh lặp icon/label ở nhiều nơi gọi. `shares === null` (luôn
 * đúng với Instagram — Graph API không lộ field chia sẻ cho media, xem
 * `content-trending-types.ts`) thì bỏ hẳn mục Chia sẻ, không hiện "0" giả
 * (0 chia sẻ thật chỉ có thể xảy ra với Facebook).
 */
export function buildMetaPostMetrics(
  likes: number,
  comments: number,
  shares: number | null,
): MetaPostMetric[] {
  const metrics: MetaPostMetric[] = [
    { icon: Heart, label: 'Lượt thích', value: likes },
    { icon: MessageCircle, label: 'Bình luận', value: comments },
  ]
  if (shares !== null) metrics.push({ icon: Share2, label: 'Chia sẻ', value: shares })
  return metrics
}
