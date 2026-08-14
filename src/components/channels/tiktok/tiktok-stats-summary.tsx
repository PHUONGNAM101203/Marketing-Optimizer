import { Card } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'
import type { TiktokVideoCardData } from './tiktok-video-grid'

/* Hallmark · component: tiktok-stats-summary · theme: studied-DNA (Ink & Signal) */
export function TiktokStatsSummary({ videos }: { readonly videos: readonly TiktokVideoCardData[] }) {
  const totals = videos.reduce(
    (accumulated, video) => ({
      likes: accumulated.likes + video.likes,
      comments: accumulated.comments + video.comments,
      shares: accumulated.shares + video.shares,
    }),
    { likes: 0, comments: 0, shares: 0 },
  )

  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryTile label="Tổng lượt thích" value={totals.likes} />
      <SummaryTile label="Tổng bình luận" value={totals.comments} />
      <SummaryTile label="Tổng chia sẻ" value={totals.shares} />
    </div>
  )
}

function SummaryTile({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </p>
      <p
        data-numeric
        className="text-[length:var(--text-2xl)] leading-[var(--leading-tight)] font-semibold tracking-[var(--tracking-tight)] text-[var(--color-ink)]"
      >
        {formatNumber(value)}
      </p>
    </Card>
  )
}
