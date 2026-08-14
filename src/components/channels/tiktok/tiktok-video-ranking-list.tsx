import { Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact } from '@/lib/format'

export interface RankedVideoItem {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly views: number
}

/* Hallmark · component: tiktok-video-ranking-list · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho hai widget xếp hạng khác nguồn dữ liệu (top trong khoảng
 * lọc / top mọi thời gian) — cả hai chỉ cần rank + thumbnail + tiêu đề +
 * view, nên rút về MỘT hình dạng tối thiểu thay vì hai component gần giống
 * hệt nhau.
 */
export function TiktokVideoRankingList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly RankedVideoItem[]
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <span
            data-numeric
            className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
          >
            {index + 1}
          </span>
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt=""
              className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
          )}
          <p
            className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
            title={item.title}
          >
            {item.title}
          </p>
          <span
            data-numeric
            className="flex shrink-0 items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
          >
            <Eye aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
            {formatCompact(item.views)}
          </span>
        </div>
      ))}
    </Card>
  )
}
