import { SectionHead } from '@/components/ui/card'
import { MetaPostList, type MetaPostItem } from './meta-post-list'
import { MetaTrendingWidget } from './meta-trending-widget'
import { MetaStatsSummary } from './meta-stats-summary'
import { buildMetaPostMetrics } from './meta-post-metrics'
import type { ContentTrendingResult } from '@/lib/providers/content-trending-types'

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
  const rankedAllTime: MetaPostItem[] = trending.topAllTime.slice(0, 10).map((post) =>
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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Bài đăng tương tác nhiều nhất — ${rangeLabel}`} />
        <MetaPostList
          posts={postsInRange.map(toPostItem)}
          fetchError={fetchError}
          emptyDescription="Chưa có bài đăng công khai trong khoảng ngày này."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Bài đăng tương tác nhiều nhất mọi thời gian" />
        <MetaPostList
          posts={rankedAllTime}
          fetchError={null}
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
