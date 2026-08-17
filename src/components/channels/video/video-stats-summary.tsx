import { STATS_DONUT_COLOR_TOKENS, StatsDonut, type StatsDonutSlice } from '@/components/ui/stats-donut'

/* Hallmark · component: video-stats-summary · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho TikTok/YouTube — donut giống hệt `MetaStatsSummary`
 * (Facebook/Instagram), cả hai đều vẽ qua `StatsDonut` dùng chung (xem
 * `src/components/ui/stats-donut.tsx`), thay cho 3 ô lưới cũ. Khác Meta:
 * TikTok/YouTube luôn có field `shares` dạng số (không `null` như Instagram
 * media), nên luôn hiện đủ 3 lát — không cần cờ `showShares`.
 */
export function VideoStatsSummary({
  videos,
}: {
  readonly videos: readonly { readonly likes: number; readonly comments: number; readonly shares: number }[]
}) {
  const totals = videos.reduce(
    (accumulated, video) => ({
      likes: accumulated.likes + video.likes,
      comments: accumulated.comments + video.comments,
      shares: accumulated.shares + video.shares,
    }),
    { likes: 0, comments: 0, shares: 0 },
  )

  const slices: readonly StatsDonutSlice[] = [
    { key: 'likes', label: 'Lượt thích', value: totals.likes, colorToken: STATS_DONUT_COLOR_TOKENS[0] },
    { key: 'comments', label: 'Bình luận', value: totals.comments, colorToken: STATS_DONUT_COLOR_TOKENS[1] },
    { key: 'shares', label: 'Chia sẻ', value: totals.shares, colorToken: STATS_DONUT_COLOR_TOKENS[2] },
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
