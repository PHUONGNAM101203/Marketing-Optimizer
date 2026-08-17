import { StatsDonut } from '@/components/ui/stats-donut-lazy'
import { STATS_DONUT_COLOR_TOKENS, type StatsDonutSlice } from '@/components/ui/stats-donut-tokens'

/* Hallmark · component: meta-stats-summary · theme: studied-DNA (Ink & Signal)
 *
 * Tổng hợp likes/comments/shares của Facebook/Instagram thành slices rồi vẽ
 * qua `StatsDonut` dùng chung (xem `src/components/ui/stats-donut.tsx`) —
 * phần donut/legend/tooltip đã chuyển hết sang đó, file này chỉ còn logic
 * tổng hợp và quy ước riêng của Meta (`showShares=false` cho Instagram, Graph
 * API không lộ field này cho media, khác 0 chia sẻ thật của Facebook).
 */
export function MetaStatsSummary({
  posts,
  showShares,
}: {
  readonly posts: readonly { readonly likes: number; readonly comments: number; readonly shares: number | null }[]
  readonly showShares: boolean
}) {
  const totals = posts.reduce<{ likes: number; comments: number; shares: number }>(
    (accumulated, post) => ({
      likes: accumulated.likes + post.likes,
      comments: accumulated.comments + post.comments,
      shares: accumulated.shares + (post.shares ?? 0),
    }),
    { likes: 0, comments: 0, shares: 0 },
  )

  const slices: readonly StatsDonutSlice[] = [
    { key: 'likes', label: 'Lượt thích', value: totals.likes, colorToken: STATS_DONUT_COLOR_TOKENS[0] },
    { key: 'comments', label: 'Bình luận', value: totals.comments, colorToken: STATS_DONUT_COLOR_TOKENS[1] },
    ...(showShares
      ? [{ key: 'shares', label: 'Chia sẻ', value: totals.shares, colorToken: STATS_DONUT_COLOR_TOKENS[2] } as const]
      : []),
  ]

  return (
    <StatsDonut
      slices={slices}
      totalLabel="tổng tương tác"
      emptyTitle="Chưa có tương tác"
      emptyDescription="Chưa có đủ dữ liệu trong khoảng ngày này để vẽ biểu đồ."
    />
  )
}
