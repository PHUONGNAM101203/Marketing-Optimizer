import { SectionHead } from '@/components/ui/card'
import { VideoRankingList, type VideoRankingItem } from '@/components/channels/video/video-ranking-list'
import { VideoTrendingWidget } from '@/components/channels/video/video-trending-widget'
import { VideoStatsSummary } from '@/components/channels/video/video-stats-summary'
import type { VideoSummary, VideoTrendingResult } from '@/lib/providers/video-trending-types'
import {
  excludeUnavailable,
  filterPostedInRange,
} from '@/lib/domain/video-posted-in-range'

const RANKING_LIMIT = 5

/* Hallmark · component: tiktok-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Bốn widget độc lập, không có widget nào tự fetch gì thêm — `rangeStats`
 * và `trending` đều đã có sẵn trên `detail` trước khi trang này render (xem
 * getChannelDetail's `case 'tiktok'`), tab chỉ là chế độ hiển thị khác đi.
 *
 * `rangeStats` đọc từ snapshot đã lưu (`video_metrics_daily`), KHÔNG PHẢI
 * `detail.data.topVideos` (Display API live, 20 video gần nhất lọc theo NGÀY
 * ĐĂNG) — cách cũ trả rỗng cho mọi video cũ hơn 20-video-gần-nhất dù video đó
 * vẫn còn hoạt động trong khoảng ngày chọn (xem docblock `rangeStats` trên
 * `ChannelDetail`). `createdAt`/`permalinkUrl` giờ lấy thẳng từ
 * `VideoSummary` (cột `posted_at`/`permalink_url` của `video_metrics_daily`,
 * xem `20260820000001_video_metrics_posted_at.sql`) — `null` chỉ còn xảy ra
 * với các dòng snapshot ghi TRƯỚC khi hai cột này tồn tại, tự lấp đầy ở lần
 * đồng bộ kế tiếp. `VideoDetailDialog` tự ẩn nút link khi `permalinkUrl`
 * null.
 *
 * `get_video_range_snapshots` (RPC nguồn của `rangeStats`) giờ CHỈ trả về
 * video có tăng trưởng ĐÁNG TIN — có baseline snapshot thật trước khoảng
 * chọn, HOẶC biết chắc video đăng TRONG khoảng chọn (baseline=0 đúng về mặt
 * logic, không phải lỗ hổng lịch sử — xem
 * `20260820000003_video_range_verified_only.sql`). Video cũ hơn khoảng chọn
 * mà lịch sử snapshot chưa đủ sâu để biết chắc bị LOẠI HẲN thay vì hiện số
 * cộng dồn giả — mảng rỗng tự rơi về empty state của
 * `VideoRankingList`/`VideoStatsSummary` bên dưới, không cần banner cảnh báo
 * riêng nữa.
 */
export function TiktokDashboard({
  rangeStats,
  rangeStart,
  rangeEnd,
  trending,
  rangeLabel,
  videoSnapshotsLikelyBroken,
}: {
  readonly rangeStats: readonly VideoSummary[]
  /** Mốc ngày THẬT của khoảng đang chọn (không phải nhãn hiển thị) — bảng xếp
   * hạng lọc theo ngày đăng, xem `filterPostedInRange`. */
  readonly rangeStart: string
  readonly rangeEnd: string
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
  readonly videoSnapshotsLikelyBroken: boolean
}) {
  // Xếp hạng chỉ tính video ĐĂNG trong khoảng — khớp với tab Tổng quan. Widget
  // "Thống kê" bên dưới vẫn dùng `rangeStats` đầy đủ: tổng tương tác trong
  // khoảng thì phải tính cả phần video cũ kiếm được, lọc đi là báo thiếu.
  const rankedInRange: VideoRankingItem[] = excludeUnavailable(
    filterPostedInRange(rangeStats, rangeStart, rangeEnd),
  )
    .slice(0, RANKING_LIMIT)
    .map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    createdAt: video.createdAt,
    permalinkUrl: video.permalinkUrl,
  }))
  const rankedAllTime: VideoRankingItem[] = excludeUnavailable(trending.topAllTime)
    .slice(0, RANKING_LIMIT)
    .map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    createdAt: video.createdAt,
    permalinkUrl: video.permalinkUrl,
  }))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Video xem nhiều nhất — ${rangeLabel}`} />
        <VideoRankingList
          items={rankedInRange}
          platformLabel="TikTok"
          emptyTitle="Chưa có video nào đăng trong khoảng này"
          emptyDescription="Bảng này chỉ xếp hạng video ĐĂNG trong khoảng ngày đang chọn, giống tab Tổng quan. Nới rộng khoảng ngày để thấy nhiều hơn."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Video xem nhiều nhất mọi thời gian" />
        <VideoRankingList
          items={rankedAllTime}
          platformLabel="TikTok"
          emptyTitle="Chưa có dữ liệu"
          emptyDescription="Video sẽ xuất hiện sau lần đồng bộ tiếp theo."
        />
      </section>

      <VideoTrendingWidget
        trendingFast={trending.trendingFast}
        rangeLabel={rangeLabel}
        platformLabel="TikTok"
        likelyBroken={videoSnapshotsLikelyBroken}
      />

      <section className="flex flex-col gap-3">
        <SectionHead label="Tổng quan tương tác" title={`Thống kê — ${rangeLabel}`} />
        <VideoStatsSummary
          videos={rangeStats.map((video) => ({
            likes: video.likes,
            comments: video.comments,
            shares: video.shares ?? 0,
          }))}
        />
      </section>
    </div>
  )
}
