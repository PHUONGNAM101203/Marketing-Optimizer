import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Delta } from './delta'
import type { MetricKey } from '@/lib/metrics/derive'

/* Hallmark · component: stat-tile · theme: studied-DNA (Ink & Signal)
 *
 * Bản Stitch tham chiếu nhét một icon trong ô vuông nền xanh nhạt vào GÓC MỖI
 * thẻ, lặp hơn mười lần trên bốn màn hình. Icon đó không mang thông tin gì —
 * nhãn đã nói rồi. Bỏ nó đi, con số được thở, và thẻ hết giống template.
 *
 * Phân cấp ở đây do kích thước chữ và khoảng trắng đảm nhiệm, không do màu.
 */

export interface StatTileProps {
  readonly label: string
  readonly value: string
  readonly metric: MetricKey
  readonly deltaPct: number | null
  readonly comparisonLabel?: string
  /** Dòng phụ: mục tiêu, mẫu số, hoặc ghi chú ngữ cảnh. */
  readonly footnote?: ReactNode
  readonly size?: 'md' | 'lg'
  readonly className?: string
}

export function StatTile({
  label,
  value,
  metric,
  deltaPct,
  comparisonLabel = 'so với kỳ trước',
  footnote,
  size = 'md',
  className,
}: StatTileProps) {
  return (
    // `h-full` + `mt-auto` ở footnote: con số phải nằm cùng một đường ngang qua
    // mọi ô trong hàng. Nếu để footnote đẩy khối giá trị, ô có ghi chú sẽ lệch
    // lên so với ô không có, và mắt mất đi đường canh để so sánh.
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-3',
        'rounded-[var(--radius-lg)] border border-[var(--color-rule)]',
        'bg-[var(--color-paper)] p-5',
        className,
      )}
    >
      <p className="text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </p>

      <div className="min-w-0">
        <p
          data-numeric
          className={cn(
            'truncate font-semibold text-[var(--color-ink)]',
            'leading-[var(--leading-tight)] tracking-[var(--tracking-tight)]',
            size === 'lg' ? 'text-[length:var(--text-4xl)]' : 'text-[length:var(--text-3xl)]',
          )}
        >
          {value}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Delta
            metric={metric}
            deltaPct={deltaPct}
            comparisonLabel={comparisonLabel}
          />
        </div>
      </div>

      {footnote ? (
        <p className="mt-auto pt-1 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          {footnote}
        </p>
      ) : null}
    </div>
  )
}

/** Hàng KPI. `minmax(0,1fr)` chứ không phải `1fr` — số dài sẽ đẩy vỡ lưới. */
export function StatRow({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        'grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]',
        className,
      )}
    >
      {children}
    </div>
  )
}
