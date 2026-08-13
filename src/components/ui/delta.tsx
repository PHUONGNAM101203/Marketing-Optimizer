import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDelta } from '@/lib/format'
import { deltaTone, METRIC_DIRECTION, type MetricKey } from '@/lib/metrics/derive'

/* Hallmark · component: delta · theme: studied-DNA (Ink & Signal)
 *
 * MỘT component duy nhất cho mọi thay đổi trong toàn app.
 *
 * Bản Stitch tham chiếu dùng ba cách hiển thị delta khác nhau trên bốn màn hình
 * (pill xanh, pill hồng, chữ màu) và tô đỏ "Spend +12.5%" — tức coi chi nhiều
 * hơn là xấu. Sai: chi tăng khi ROAS giữ nguyên là mở rộng quy mô.
 *
 * Ở đây màu đến TỪ metric, qua METRIC_DIRECTION, không phải từ dấu của con số.
 * Chi phí, hiển thị và số phiên là `neutral` — chúng không tự thân tốt hay xấu.
 */

const TONE_CLASS = {
  positive: 'text-[var(--color-positive)]',
  negative: 'text-[var(--color-negative)]',
  neutral: 'text-[var(--color-ink-2)]',
} as const

const TONE_PILL = {
  positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)]',
  negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)]',
  neutral: 'bg-[var(--color-paper-3)] text-[var(--color-ink-2)]',
} as const

export interface DeltaProps {
  readonly metric: MetricKey
  readonly deltaPct: number | null
  readonly variant?: 'inline' | 'pill'
  /** Ví dụ "so với kỳ trước". */
  readonly comparisonLabel?: string
  readonly className?: string
}

export function Delta({
  metric,
  deltaPct,
  variant = 'inline',
  comparisonLabel,
  className,
}: DeltaProps) {
  const tone = deltaTone(metric, deltaPct)
  const direction = METRIC_DIRECTION[metric]

  if (deltaPct === null) {
    return (
      <span
        className={cn('text-[length:var(--text-xs)] text-[var(--color-ink-3)]', className)}
      >
        Chưa có kỳ trước
      </span>
    )
  }

  const Arrow = deltaPct > 0 ? ArrowUp : deltaPct < 0 ? ArrowDown : ArrowRight

  // Mũi tên mang hướng thay đổi, màu mang ý nghĩa. Tách hai thứ này ra là cách
  // duy nhất để hiện "chi phí tăng" mà không ngụ ý tăng là xấu.
  const readout = (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        variant === 'pill'
          ? cn(
              'rounded-[var(--radius-full)] px-2 py-0.5 text-[length:var(--text-2xs)]',
              TONE_PILL[tone],
            )
          : cn('text-[length:var(--text-xs)]', TONE_CLASS[tone]),
      )}
    >
      <Arrow aria-hidden className="size-3" />
      <span data-numeric>{formatDelta(deltaPct)}</span>
    </span>
  )

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {readout}
      {comparisonLabel ? (
        <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          {comparisonLabel}
        </span>
      ) : null}
      <span className="sr-only">
        {direction === 'neutral'
          ? 'chỉ số trung tính, thay đổi không mang nghĩa tốt hay xấu'
          : tone === 'positive'
            ? 'thay đổi theo hướng tốt'
            : 'thay đổi theo hướng xấu'}
      </span>
    </span>
  )
}
