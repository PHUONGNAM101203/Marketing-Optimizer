import { TiktokVideoGrid } from './tiktok-video-grid'
import { getTiktokVideosPostedInRange } from '@/lib/data/video-trending'
import { snapshotUpperBound } from '@/lib/data/site-channels'

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
  // `endDate` mọi preset (trừ "Hôm nay") cố tình chốt ở HÔM QUA — cùng lý do
  // `snapshotUpperBound` đã áp cho `getTiktokVideoRangeStats`
  // (`site-channel-detail.ts`). Thiếu dòng này, video đăng HÔM NAY (snapshot
  // ghi ngay lúc đồng bộ) bị lọc mất khỏi tab "Tổng quan" dù tab "Dashboard"
  // (đã áp `snapshotUpperBound`) vẫn thấy — đúng lỗi người dùng phát hiện qua
  // ảnh chụp (video "20-08" có ở Dashboard, thiếu ở Tổng quan).
  const videos = await getTiktokVideosPostedInRange(connectionId, {
    startDate,
    endDate: snapshotUpperBound(endDate),
  })
  return <TiktokVideoGrid videos={videos} fetchError={null} />
}
