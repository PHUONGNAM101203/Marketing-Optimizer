import { SectionHead } from '@/components/ui/card'
import { VideoRankingList, type VideoRankingItem } from '@/components/channels/video/video-ranking-list'
import { VideoTrendingWidget } from '@/components/channels/video/video-trending-widget'
import { VideoStatsSummary } from '@/components/channels/video/video-stats-summary'
import type { VideoSummary, VideoTrendingResult } from '@/lib/providers/video-trending-types'

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
 */
export function TiktokDashboard({
  rangeStats,
  trending,
  rangeLabel,
  videoSnapshotsLikelyBroken,
}: {
  readonly rangeStats: readonly VideoSummary[]
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
  readonly videoSnapshotsLikelyBroken: boolean
}) {
  const rankedInRange: VideoRankingItem[] = rangeStats.slice(0, RANKING_LIMIT).map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    createdAt: video.createdAt,
    permalinkUrl: video.permalinkUrl,
  }))
  const rankedAllTime: VideoRankingItem[] = trending.topAllTime.slice(0, RANKING_LIMIT).map((video) => ({
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
          emptyTitle="Chưa có video"
          emptyDescription="Chưa có video công khai trong khoảng ngày này."
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
        earliestSnapshotAt={trending.earliestSnapshotAt}
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
