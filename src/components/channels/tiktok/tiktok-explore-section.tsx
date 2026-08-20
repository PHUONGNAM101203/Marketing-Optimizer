import { TiktokVideoGrid } from './tiktok-video-grid'
import { getTiktokVideosPostedInRange } from '@/lib/data/video-trending'

/* Hallmark · component: tiktok-explore-section · theme: studied-DNA (Ink & Signal)
 *
 * Server Component async RIÊNG cho tab "Tổng quan" — tách khỏi
 * `getChannelDetail` để trang cha bọc nó trong `<Suspense>` (xem
 * `channel-detail-body.tsx`), không chặn TTFB của cả trang chi tiết kênh.
 * Đọc thẳng `video_metrics_daily` theo `posted_at` (đã có TOÀN BỘ video
 * account nhờ đồng bộ hằng ngày phân trang hết, không giới hạn 20 như Display
 * API sống) — không cần token/gọi mạng TikTok nữa, chỉ một truy vấn Supabase.
 */
export async function TiktokExploreSection({
  connectionId,
  startDate,
  endDate,
}: {
  readonly connectionId: string
  readonly startDate: string
  readonly endDate: string
}) {
  const videos = await getTiktokVideosPostedInRange(connectionId, { startDate, endDate })
  return <TiktokVideoGrid videos={videos} fetchError={null} />
}
