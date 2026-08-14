import { SectionHead } from '@/components/ui/card'
import { TiktokVideoRankingList } from './tiktok-video-ranking-list'
import { TiktokTrendingWidget } from './tiktok-trending-widget'
import { TiktokStatsSummary } from './tiktok-stats-summary'
import type { TiktokVideoCardData } from './tiktok-video-grid'
import type { VideoTrendingResult } from '@/lib/providers/video-trending-types'

/* Hallmark · component: tiktok-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Bốn widget độc lập, không có widget nào tự fetch gì thêm — `topVideosInRange`
 * và `trending` đều đã có sẵn trên `detail` trước khi trang này render (xem
 * getChannelDetail's `case 'tiktok'`), tab chỉ là chế độ hiển thị khác đi.
 */
export function TiktokDashboard({
  topVideosInRange,
  trending,
  rangeLabel,
}: {
  readonly topVideosInRange: readonly TiktokVideoCardData[]
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
}) {
  const rankedInRange = topVideosInRange.map((video) => ({
    title: video.title,
    thumbnailUrl: video.coverImageUrl,
    views: video.views,
  }))
  const rankedAllTime = trending.topAllTime.slice(0, 10).map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
  }))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Video xem nhiều nhất — ${rangeLabel}`} />
        <TiktokVideoRankingList
          items={rankedInRange}
          emptyTitle="Chưa có video"
          emptyDescription="Chưa có video công khai trong khoảng ngày này."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Video xem nhiều nhất mọi thời gian" />
        <TiktokVideoRankingList
          items={rankedAllTime}
          emptyTitle="Chưa có dữ liệu"
          emptyDescription="Video sẽ xuất hiện sau lần đồng bộ tiếp theo."
        />
      </section>

      <TiktokTrendingWidget
        trendingFast={trending.trendingFast}
        earliestSnapshotAt={trending.earliestSnapshotAt}
      />

      <section className="flex flex-col gap-3">
        <SectionHead label="Tổng quan tương tác" title={`Thống kê — ${rangeLabel}`} />
        <TiktokStatsSummary videos={topVideosInRange} />
      </section>
    </div>
  )
}
