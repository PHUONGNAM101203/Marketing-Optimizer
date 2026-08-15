import { Card } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: meta-stats-summary · theme: studied-DNA (Ink & Signal)
 *
 * `showShares=false` (Instagram) ẩn hẳn ô Chia sẻ thay vì hiện "0" giả —
 * Graph API không lộ field này cho media, khác 0 chia sẻ thật của Facebook.
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

  return (
    <div className={showShares ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
      <SummaryTile label="Tổng lượt thích" value={totals.likes} />
      <SummaryTile label="Tổng bình luận" value={totals.comments} />
      {showShares ? <SummaryTile label="Tổng chia sẻ" value={totals.shares} /> : null}
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
