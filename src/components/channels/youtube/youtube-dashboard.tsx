import { SectionHead } from '@/components/ui/card'
import { VideoRankingList, type VideoRankingItem } from '@/components/channels/video/video-ranking-list'
import { VideoTrendingWidget } from '@/components/channels/video/video-trending-widget'
import { VideoStatsSummary } from '@/components/channels/video/video-stats-summary'
import type { YoutubeExplore } from '@/lib/providers/google-explore'
import type { VideoTrendingResult } from '@/lib/providers/video-trending-types'

const RANKING_LIMIT = 5

const YOUTUBE_WATCH_URL = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`

/* Hallmark · component: youtube-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Cùng bố cục `TiktokDashboard` — bốn widget độc lập dùng chung component
 * `video/` (ranking list/trending widget/stats summary), không widget nào
 * tự fetch gì thêm. KHÁC TikTok ở một điểm: link gốc dựng được cho CẢ hai
 * bảng xếp hạng (không chỉ bảng "trong khoảng ngày") — permalink YouTube là
 * hàm thuần của `externalVideoId` (watch?v=), không cần lưu riêng như
 * TikTok (URL TikTok cần cả username, không suy ra được chỉ từ video ID).
 */
export function YoutubeDashboard({
  topVideosInRange,
  trending,
  rangeLabel,
}: {
  readonly topVideosInRange: YoutubeExplore['topVideos']
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
}) {
  const rankedInRange: VideoRankingItem[] = topVideosInRange.slice(0, RANKING_LIMIT).map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    createdAt: video.createdAt,
    permalinkUrl: YOUTUBE_WATCH_URL(video.externalVideoId),
  }))
  const rankedAllTime: VideoRankingItem[] = trending.topAllTime.slice(0, RANKING_LIMIT).map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    createdAt: null,
    permalinkUrl: YOUTUBE_WATCH_URL(video.externalVideoId),
  }))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Video xem nhiều nhất — ${rangeLabel}`} />
        <VideoRankingList
          items={rankedInRange}
          platformLabel="YouTube"
          emptyTitle="Chưa có video"
          emptyDescription="Chưa có video nào trong khoảng ngày này."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Video xem nhiều nhất mọi thời gian" />
        <VideoRankingList
          items={rankedAllTime}
          platformLabel="YouTube"
          emptyTitle="Chưa có dữ liệu"
          emptyDescription="Video sẽ xuất hiện sau lần đồng bộ tiếp theo."
        />
      </section>

      <VideoTrendingWidget trendingFast={trending.trendingFast} rangeLabel={rangeLabel} />

      <section className="flex flex-col gap-3">
        <SectionHead label="Tổng quan tương tác" title={`Thống kê — ${rangeLabel}`} />
        <VideoStatsSummary
          videos={topVideosInRange.map((video) => ({
            likes: video.likes,
            comments: video.comments,
            shares: video.shares ?? 0,
          }))}
        />
      </section>
    </div>
  )
}
