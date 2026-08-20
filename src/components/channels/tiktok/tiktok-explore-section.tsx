import { TiktokVideoGrid } from './tiktok-video-grid'
import { getTiktokExploreVideos } from '@/lib/data/site-channel-detail'

/* Hallmark · component: tiktok-explore-section · theme: studied-DNA (Ink & Signal)
 *
 * Server Component async RIÊNG cho lượt gọi TikTok Display API sống (20 video
 * gần nhất) — tách khỏi `getChannelDetail` để trang cha bọc nó trong
 * `<Suspense>` (xem `channel-detail-body.tsx`) thay vì để lượt gọi mạng thật
 * này chặn TTFB của toàn bộ trang chi tiết kênh mỗi lần đổi khoảng ngày. Chỉ
 * dùng cho tab "Tổng quan" — tab "Dashboard" (mặc định) không phụ thuộc
 * component này, nên hiện gần như ngay lập tức bất kể TikTok API phản hồi
 * nhanh hay chậm.
 */
export async function TiktokExploreSection({
  siteId,
  connectionId,
  startDate,
  endDate,
}: {
  readonly siteId: string
  readonly connectionId: string
  readonly startDate: string
  readonly endDate: string
}) {
  const { topVideos, fetchError } = await getTiktokExploreVideos(siteId, connectionId, { startDate, endDate })
  return <TiktokVideoGrid videos={topVideos} fetchError={fetchError} />
}
