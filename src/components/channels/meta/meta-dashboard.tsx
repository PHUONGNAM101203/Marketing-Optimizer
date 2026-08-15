import { SectionHead } from '@/components/ui/card'
import type { MetaPostItem } from './meta-post-list'
import { MetaRankingList } from './meta-ranking-list'
import { MetaTrendingWidget } from './meta-trending-widget'
import { MetaStatsSummary } from './meta-stats-summary'
import { buildMetaPostMetrics } from './meta-post-metrics'
import type { ContentTrendingResult } from '@/lib/providers/content-trending-types'

/** Số mục hiện trong MỖI bảng xếp hạng — đủ để so sánh mà không loãng, và
 * luôn lấp đầy `MetaRankingList` gọn gàng (khác lưới thẻ, 5 mục lẻ để lại
 * một ô trống ở lưới 3 cột). */
const RANKING_LIMIT = 5

/** Dữ liệu thô của một bài đăng trong khoảng ngày đang lọc (từ
 * `fetchInstagramExplore`/`fetchFacebookContentExplore`, KHÔNG phải
 * `MetaPostItem` đã dựng sẵn `metrics`) — `MetaDashboard` tự dựng cả
 * `MetaPostItem` (cho danh sách xếp hạng) LẪN tổng (cho `MetaStatsSummary`)
 * từ cùng một nguồn thô này, tránh phải tách `metrics` ngược lại để cộng
 * tổng (mảng `metrics` không cố định thứ tự/độ dài giữa Facebook/Instagram). */
export interface MetaPostStats {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly createdAt: string | null
  readonly permalinkUrl: string | null
  readonly likes: number
  readonly comments: number
  readonly shares: number | null
}

const toPostItem = (post: MetaPostStats): MetaPostItem => ({
  title: post.title,
  thumbnailUrl: post.thumbnailUrl,
  createdAt: post.createdAt,
  permalinkUrl: post.permalinkUrl,
  metrics: buildMetaPostMetrics(post.likes, post.comments, post.shares),
})

/* Hallmark · component: meta-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Cùng bố cục `TiktokDashboard` (4 widget độc lập, không widget nào tự fetch
 * gì thêm — `postsInRange` và `trending` đều đã có sẵn trên `detail` trước
 * khi trang này render, xem `getChannelDetail`'s `case 'facebook'/'instagram'`).
 * Đổi "top video theo views" thành "top bài đăng theo tổng engagement" —
 * Facebook/Instagram không có số liệu lượt xem cho bài đăng.
 */
export function MetaDashboard({
  postsInRange,
  trending,
  rangeLabel,
  showShares,
  fetchError,
}: {
  readonly postsInRange: readonly MetaPostStats[]
  readonly trending: ContentTrendingResult
  readonly rangeLabel: string
  readonly showShares: boolean
  readonly fetchError: string | null
}) {
  const rankedAllTime: MetaPostItem[] = trending.topAllTime.slice(0, RANKING_LIMIT).map((post) =>
    toPostItem({
      title: post.title,
      thumbnailUrl: post.thumbnailUrl,
      createdAt: post.createdAt,
      permalinkUrl: post.permalinkUrl,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
    }),
  )

  // `postsInRange` đã sắp theo engagement giảm dần từ nơi fetch
  // (`fetchInstagramExplore`/`fetchFacebookContentExplore`) — cắt top 5 ở
  // ĐÂY, không phải ở nguồn, vì tab Tổng quan cần TOÀN BỘ danh sách đó (yêu
  // cầu gốc: "tổng quan thể hiện hết tất cả bài viết"), chỉ Dashboard mới
  // giới hạn. `MetaStatsSummary` bên dưới vẫn cộng trên `postsInRange` ĐẦY
  // ĐỦ (không cắt) — tổng trong khoảng ngày phải đúng, không phải tổng top 5.
  const rankedInRange = postsInRange.slice(0, RANKING_LIMIT).map(toPostItem)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Bài đăng tương tác nhiều nhất — ${rangeLabel}`} />
        <MetaRankingList
          items={rankedInRange}
          fetchError={fetchError}
          emptyTitle="Chưa có bài đăng"
          emptyDescription="Chưa có bài đăng công khai trong khoảng ngày này."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Bài đăng tương tác nhiều nhất mọi thời gian" />
        <MetaRankingList
          items={rankedAllTime}
          emptyTitle="Chưa có dữ liệu"
          emptyDescription="Bài đăng sẽ xuất hiện sau lần đồng bộ tiếp theo."
        />
      </section>

      <MetaTrendingWidget trendingFast={trending.trendingFast} earliestSnapshotAt={trending.earliestSnapshotAt} />

      <section className="flex flex-col gap-3">
        <SectionHead label="Tổng quan tương tác" title={`Thống kê — ${rangeLabel}`} />
        <MetaStatsSummary posts={postsInRange} showShares={showShares} />
      </section>
    </div>
  )
}
