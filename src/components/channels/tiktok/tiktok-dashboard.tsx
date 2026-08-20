import { Info } from 'lucide-react'
import { SectionHead } from '@/components/ui/card'
import { Callout } from '@/components/ui/feedback'
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
  rangeStartDate,
  videoSnapshotsLikelyBroken,
}: {
  readonly rangeStats: readonly VideoSummary[]
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
  /** ISO — đầu khoảng ngày ĐANG chọn, so với `trending.earliestSnapshotAt` để
   * biết "tăng trưởng trong khoảng" bên dưới có thật sự bị cắt bởi lịch sử
   * snapshot còn mỏng hay không (xem `rangeScopeLikelyIncomplete`). */
  readonly rangeStartDate: string
  readonly videoSnapshotsLikelyBroken: boolean
}) {
  // `get_video_range_snapshots` không tìm được dòng snapshot nào TRƯỚC
  // `p_range_start` thì coi baseline = 0 (xem `getTiktokVideoRangeStats`) —
  // "tăng trưởng trong khoảng" khi đó thật ra là TỔNG CỘNG DỒN từ lúc bắt đầu
  // theo dõi, không phải đúng khoảng đã chọn. Với connection còn ít lịch sử,
  // MỌI khoảng ngày (7 ngày hay 28 ngày) đều rơi vào tình huống này và ra
  // đúng MỘT con số giống hệt nhau — không phải lỗi tính sai, mà vì chưa đủ
  // dữ liệu quá khứ để phân biệt. Nói rõ thay vì để trông như bug im lặng.
  const rangeScopeLikelyIncomplete =
    trending.earliestSnapshotAt !== null && rangeStartDate < trending.earliestSnapshotAt
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
      {rangeScopeLikelyIncomplete ? (
        <Callout
          tone="signal"
          icon={<Info aria-hidden className="size-5 text-[var(--color-signal)]" />}
          title="Số liệu dưới đây là cộng dồn từ lúc bắt đầu theo dõi, chưa đúng hẳn khoảng đã chọn"
        >
          <p>
            Kết nối chưa có snapshot nào trước {rangeLabel.toLowerCase()} — &quot;xem nhiều nhất&quot; và
            &quot;tổng quan tương tác&quot; bên dưới vì vậy giống nhau dù đổi 7/28/90 ngày, vì đều đang tính từ
            snapshot sớm nhất đang có, không phải đúng đầu khoảng đã chọn. Sẽ tự chính xác dần khi tích luỹ thêm
            snapshot mỗi ngày.
          </p>
        </Callout>
      ) : null}

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
